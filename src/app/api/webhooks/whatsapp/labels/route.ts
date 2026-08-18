import { NextResponse } from "next/server";
import { applyWaAssociation, upsertWaLabel } from "@/lib/wa-labels";
import { getSection, saveSection } from "@/lib/settings";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const SECRET = process.env.WA_WORKER_SECRET || "dev-worker-secret";

/** Etiquetas de WhatsApp Business: alta/edición/borrado y asignación a chats. */
export async function POST(request: Request) {
  if (request.headers.get("x-worker-secret") !== SECRET) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const body = (await request.json()) as {
    kind: "label" | "association";
    label?: { id: string; name?: string; color?: number; deleted?: boolean };
    phone?: string;
    labelId?: string;
    type?: "add" | "remove";
  };

  if (body.kind === "label" && body.label?.id) {
    const result = await upsertWaLabel(body.label);
    const [sync, labelsSynced] = await Promise.all([
      getSection("sync"),
      prisma.tag.count({ where: { waLabelId: { not: null } } }),
    ]);
    await saveSection("sync", { ...sync, labelsSynced, lastLabelAt: new Date().toISOString() });
    return NextResponse.json({ ok: true, ...result });
  }

  if (body.kind === "association" && body.phone && body.labelId && body.type) {
    const result = await applyWaAssociation({
      phone: body.phone,
      labelId: body.labelId,
      type: body.type,
    });
    return NextResponse.json(result);
  }

  return NextResponse.json({ ok: false, error: "payload no reconocido" }, { status: 400 });
}
