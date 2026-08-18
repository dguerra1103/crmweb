import { prisma } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { PageShell } from "@/components/page-shell";
import { Button, Card, EmptyState, PageHeader, Select } from "@/components/ui";
import { SyncWooButton } from "./sync-button";
import { money, relativeTime } from "@/lib/format";
import { sendProductAction } from "@/app/actions/inbox";
import { getSection } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ searchParams }: PageProps<"/productos">) {
  const user = await requireUser();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";

  const [products, conversations, woo, total] = await Promise.all([
    prisma.product.findMany({
      where: q
        ? { OR: [{ name: { contains: q } }, { sku: { contains: q } }, { categories: { contains: q } }] }
        : undefined,
      orderBy: { name: "asc" },
      take: 60,
    }),
    prisma.conversation.findMany({
      where: { status: { not: "closed" } },
      include: { contact: true },
      orderBy: { lastMessageAt: "desc" },
      take: 30,
    }),
    getSection("woo"),
    prisma.product.count(),
  ]);

  return (
    <PageShell wide>
      <PageHeader
        title="Productos"
        subtitle={
          woo.enabled
            ? `${total} productos sincronizados desde WooCommerce`
            : "Conecta WooCommerce en Ajustes para traer tu catálogo real"
        }
        actions={can(user, "supervisor") ? <SyncWooButton /> : null}
      />

      <form className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar producto, SKU o categoría"
          className="w-80 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button type="submit" className="rounded-xl bg-ink px-3 py-2 text-sm font-medium text-white">
          Buscar
        </button>
      </form>

      {products.length === 0 ? (
        <Card>
          <EmptyState title="Sin productos todavía">
            {woo.enabled
              ? "Pulsa «Sincronizar WooCommerce» para traer el catálogo."
              : "Configura la conexión en Ajustes → WooCommerce."}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <Card key={product.id} className="flex flex-col overflow-hidden">
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.imageUrl} alt={product.name} className="h-40 w-full object-cover" />
              ) : (
                <div className="grid h-40 w-full place-items-center bg-slate-100 text-xs text-slate-400">
                  Sin imagen
                </div>
              )}

              <div className="flex flex-1 flex-col p-3.5">
                <p className="line-clamp-2 text-sm font-medium text-ink">{product.name}</p>
                <p className="mt-1 font-mono text-lg font-semibold text-ink">{money(product.price)}</p>
                <p className="mt-1 text-xs">
                  {product.stockStatus === "instock" ? (
                    <span className="text-brand">
                      Disponible{product.stock != null ? ` · ${product.stock} und` : ""}
                    </span>
                  ) : (
                    <span className="text-clay">Agotado</span>
                  )}
                </p>
                {product.permalink ? (
                  <a
                    href={product.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 truncate text-xs text-slate-400 hover:text-brand hover:underline"
                  >
                    Ver en la tienda
                  </a>
                ) : null}

                <form action={sendProductAction} className="mt-auto flex gap-1.5 pt-3">
                  <input type="hidden" name="productId" value={product.id} />
                  <Select name="conversationId" required className="text-xs">
                    <option value="">Enviar a…</option>
                    {conversations.map((conversation) => (
                      <option key={conversation.id} value={conversation.id}>
                        {conversation.contact.name}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" size="sm">
                    Enviar
                  </Button>
                </form>

                <p className="mt-2 text-[10px] text-slate-300">Actualizado {relativeTime(product.syncedAt)}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
