import { prisma } from "@/lib/db";
import { getSection } from "@/lib/settings";
import { normalizePhone } from "@/lib/format";

type WooProduct = {
  id: number;
  name: string;
  sku?: string;
  price?: string;
  regular_price?: string;
  stock_quantity?: number | null;
  stock_status?: string;
  permalink?: string;
  short_description?: string;
  images?: { src: string }[];
  categories?: { name: string }[];
};

type WooOrder = {
  id: number;
  number: string;
  status: string;
  total: string;
  currency: string;
  date_created: string;
  payment_method_title?: string;
  billing?: { first_name?: string; last_name?: string; phone?: string; email?: string };
  line_items?: { name: string; quantity: number; total: string }[];
};

export type WooResult<T> = { ok: boolean; data?: T; error?: string };

async function wooFetch<T>(path: string, params: Record<string, string> = {}): Promise<WooResult<T>> {
  const woo = await getSection("woo");
  if (!woo.enabled || !woo.url || !woo.consumerKey || !woo.consumerSecret) {
    return { ok: false, error: "WooCommerce no está configurado. Ve a Ajustes → WooCommerce." };
  }

  const base = woo.url.replace(/\/$/, "");
  const url = new URL(`${base}/wp-json/wc/v3${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const auth = Buffer.from(`${woo.consumerKey}:${woo.consumerSecret}`).toString("base64");

  try {
    const res = await fetch(url, {
      headers: { authorization: `Basic ${auth}`, accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `WooCommerce respondió ${res.status}: ${await res.text()}` };
    return { ok: true, data: (await res.json()) as T };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "error de red" };
  }
}

export async function testWooConnection(): Promise<WooResult<{ count: number }>> {
  const res = await wooFetch<WooProduct[]>("/products", { per_page: "1" });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: { count: res.data?.length ?? 0 } };
}

/** Descarga el catálogo a la cache local (tabla Product). */
export async function syncProducts(maxPages = 5): Promise<WooResult<{ synced: number }>> {
  let synced = 0;

  for (let page = 1; page <= maxPages; page++) {
    const res = await wooFetch<WooProduct[]>("/products", {
      per_page: "50",
      page: String(page),
      status: "publish",
    });
    if (!res.ok) return { ok: false, error: res.error };
    const items = res.data ?? [];
    if (items.length === 0) break;

    for (const p of items) {
      const data = {
        name: p.name,
        sku: p.sku || null,
        price: Number(p.price ?? 0) || 0,
        regularPrice: p.regular_price ? Number(p.regular_price) : null,
        stock: p.stock_quantity ?? null,
        stockStatus: p.stock_status ?? "instock",
        imageUrl: p.images?.[0]?.src ?? null,
        permalink: p.permalink ?? null,
        categories: p.categories?.map((c) => c.name).join(", ") ?? null,
        description: (p.short_description ?? "").replace(/<[^>]*>/g, "").trim() || null,
        syncedAt: new Date(),
      };
      await prisma.product.upsert({
        where: { wooId: p.id },
        create: { wooId: p.id, ...data },
        update: data,
      });
      synced++;
    }

    if (items.length < 50) break;
  }

  return { ok: true, data: { synced } };
}

/** Descarga pedidos recientes y los vincula al contacto por teléfono. */
export async function syncOrders(maxPages = 3): Promise<WooResult<{ synced: number; linked: number }>> {
  let synced = 0;
  let linked = 0;

  for (let page = 1; page <= maxPages; page++) {
    const res = await wooFetch<WooOrder[]>("/orders", {
      per_page: "50",
      page: String(page),
      orderby: "date",
      order: "desc",
    });
    if (!res.ok) return { ok: false, error: res.error };
    const items = res.data ?? [];
    if (items.length === 0) break;

    for (const order of items) {
      const phone = order.billing?.phone ? normalizePhone(order.billing.phone) : null;
      const contact = phone ? await prisma.contact.findUnique({ where: { phone } }) : null;
      if (contact) linked++;

      const data = {
        number: order.number,
        contactId: contact?.id ?? null,
        phone,
        customerName: [order.billing?.first_name, order.billing?.last_name].filter(Boolean).join(" ") || null,
        status: order.status,
        total: Number(order.total ?? 0) || 0,
        currency: order.currency || "COP",
        items: JSON.stringify(
          (order.line_items ?? []).map((i) => ({ name: i.name, qty: i.quantity, total: Number(i.total) || 0 })),
        ),
        paymentTitle: order.payment_method_title ?? null,
        wooCreatedAt: new Date(order.date_created),
        syncedAt: new Date(),
      };

      await prisma.order.upsert({
        where: { wooId: order.id },
        create: { wooId: order.id, ...data },
        update: data,
      });
      synced++;
    }

    if (items.length < 50) break;
  }

  await recalcContactTotals();
  return { ok: true, data: { synced, linked } };
}

/** Recalcula compras y valor total gastado por contacto. */
export async function recalcContactTotals() {
  const grouped = await prisma.order.groupBy({
    by: ["contactId"],
    where: { contactId: { not: null }, status: { in: ["completed", "processing"] } },
    _sum: { total: true },
    _count: true,
    _max: { wooCreatedAt: true },
  });

  for (const row of grouped) {
    if (!row.contactId) continue;
    await prisma.contact.update({
      where: { id: row.contactId },
      data: {
        totalSpent: row._sum.total ?? 0,
        ordersCount: row._count,
        lastOrderAt: row._max.wooCreatedAt ?? null,
      },
    });
  }
}

export async function searchProducts(query: string, take = 24) {
  const term = query.trim();
  return prisma.product.findMany({
    where: term
      ? { OR: [{ name: { contains: term } }, { sku: { contains: term } }, { categories: { contains: term } }] }
      : undefined,
    orderBy: { name: "asc" },
    take,
  });
}
