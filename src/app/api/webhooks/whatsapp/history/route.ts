import { NextResponse } from "next/server";
import { importHistoryBatch, type HistoryChat, type HistoryMessage } from "@/lib/history";
import { getSection, saveSection } from "@/lib/settings";
import { logActivity } from "@/lib/activity";
import { getChannelBySession, getDefaultChannel } from "@/lib/channel";

export const dynamic = "force-dynamic";

const SECRET = process.env.WA_WORKER_SECRET || "dev-worker-secret";

/** Recibe los lotes del historial que el worker saca de WhatsApp al vincular el teléfono. */
export async function POST(request: Request) {
  if (request.headers.get("x-worker-secret") !== SECRET) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const body = (await request.json()) as {
    session?: string;
    chats?: HistoryChat[];
    messages?: HistoryMessage[];
    progress?: number | null;
    isLatest?: boolean;
    done?: boolean;
  };

  // Señal de fin de sincronización: solo actualiza el estado.
  if (body.done) {
    const sync = await getSection("sync");
    await saveSection("sync", { ...sync, historyStatus: "complete", historyProgress: 100 });
    await logActivity({
      action: "history.completed",
      summary: `Historial de WhatsApp importado: ${sync.importedMessages} mensajes en ${sync.importedChats} chats`,
    });
    return NextResponse.json({ ok: true, finished: true });
  }

  const line = body.session ? await getChannelBySession(body.session) : await getDefaultChannel();
  const result = await importHistoryBatch({
    chats: body.chats,
    messages: body.messages,
    channelId: line?.id ?? null,
  });
  const sync = await getSection("sync");

  await saveSection("sync", {
    historyStatus: body.isLatest ? "complete" : "running",
    historyProgress: Math.round(body.progress ?? sync.historyProgress),
    importedMessages: sync.importedMessages + result.messagesImported,
    importedChats: sync.importedChats + result.conversationsCreated,
    lastHistoryAt: new Date().toISOString(),
    labelsSynced: sync.labelsSynced,
    lastLabelAt: sync.lastLabelAt,
  });

  return NextResponse.json({ ok: true, ...result });
}
