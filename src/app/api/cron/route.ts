import { NextResponse } from "next/server";
import { runNoReplySweep } from "@/lib/automations";
import { tickCampaigns } from "@/lib/campaigns";
import { sweepReminders } from "@/lib/notifications";
import { getSection } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Tareas periódicas: automatizaciones "sin respuesta" y envío por lotes de campañas.
 * Llamar cada minuto desde el Programador de tareas de Windows, cron o un panel externo:
 *   curl -H "x-cron-secret: <secreto>" http://localhost:3000/api/cron
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET || "dev-cron-secret";
  if (request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const business = await getSection("business");
  const [noReply, campaignSent, alerts] = await Promise.all([
    runNoReplySweep(business.noReplyMinutes),
    tickCampaigns(),
    sweepReminders(),
  ]);

  return NextResponse.json({ ok: true, noReply, campaignSent, alerts, at: new Date().toISOString() });
}
