import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";

export const dynamic = "force-dynamic";

const SECRET = process.env.WA_WORKER_SECRET || "dev-worker-secret";

/** El worker avisa que una línea quedó conectada y con qué número. */
export async function POST(request: Request) {
  if (request.headers.get("x-worker-secret") !== SECRET) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const body = (await request.json()) as { session?: string; phone?: string };
  if (!body.session) return NextResponse.json({ ok: false, error: "falta la sesión" }, { status: 400 });

  const channel = await prisma.channel.findUnique({ where: { sessionId: body.session } });
  if (!channel) return NextResponse.json({ ok: false, error: "línea desconocida" }, { status: 404 });

  await prisma.channel.update({ where: { id: channel.id }, data: { phone: body.phone ?? null } });
  await notify({
    kind: "channel",
    title: `La línea "${channel.name}" quedó conectada`,
    body: body.phone ? `Número +${body.phone}` : undefined,
    entityType: "channel",
    entityId: channel.id,
  });

  return NextResponse.json({ ok: true });
}
