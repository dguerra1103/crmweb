import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ConversationList } from "../conversation-list";
import { ContactPanel } from "./contact-panel";
import { Composer } from "@/components/composer";
import { AutoSubmitSelect } from "@/components/auto-submit";
import { Avatar } from "@/components/ui";
import { dateTime, prettyPhone, timeOnly } from "@/lib/format";
import { assignAction, markReadAction, setStatusAction, toggleAiAction, toggleFavoriteAction } from "@/app/actions/inbox";
import { CONVERSATION_STATUSES } from "@/lib/constants";

export const dynamic = "force-dynamic";

function dayLabel(date: Date) {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const yesterday = new Date(today.getTime() - 86400000);
  if (isToday) return "Hoy";
  if (date.toDateString() === yesterday.toDateString()) return "Ayer";
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

export default async function ConversationPage({ params, searchParams }: PageProps<"/inbox/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const filter = typeof sp.filter === "string" ? sp.filter : "todos";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const lineId = typeof sp.linea === "string" ? sp.linea : "";

  const [conversation, quickReplies, agents] = await Promise.all([
    prisma.conversation.findUnique({
      where: { id },
      include: {
        contact: true,
        assignedTo: true,
        messages: { orderBy: { createdAt: "asc" }, take: 300, include: { sender: true } },
      },
    }),
    prisma.quickReply.findMany({ where: { active: true }, orderBy: { shortcut: "asc" } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  if (!conversation) notFound();

  const status = CONVERSATION_STATUSES.find((s) => s.value === conversation.status) ?? CONVERSATION_STATUSES[0];

  // Se calculan los separadores de día antes de renderizar el hilo.
  const timeline = conversation.messages.map((message, index) => {
    const day = dayLabel(message.createdAt);
    const previous = index > 0 ? dayLabel(conversation.messages[index - 1].createdAt) : null;
    return { message, day, showDay: day !== previous };
  });

  return (
    <div className="flex h-full">
      <ConversationList user={user} filter={filter} q={q} lineId={lineId} activeId={conversation.id} />

      <main className={`flex min-w-0 flex-1 flex-col ${conversation.aiEnabled ? "ai-live" : ""}`}>
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
          <Avatar name={conversation.contact.name} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{conversation.contact.name}</p>
            <p className="font-mono text-xs text-slate-400">{prettyPhone(conversation.contact.phone)}</p>
          </div>

          <div className="flex items-center gap-1.5">
            <form action={toggleAiAction}>
              <input type="hidden" name="conversationId" value={conversation.id} />
              <button
                type="submit"
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  conversation.aiEnabled
                    ? "border-brand bg-brand text-white"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
                title="Activar o desactivar la IA en esta conversación"
              >
                <span
                  className={`h-3 w-6 rounded-full p-0.5 transition ${
                    conversation.aiEnabled ? "bg-white/40" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`block h-2 w-2 rounded-full bg-white transition ${
                      conversation.aiEnabled ? "translate-x-3" : ""
                    } ${conversation.aiEnabled ? "" : "bg-slate-400"}`}
                  />
                </span>
                IA
              </button>
            </form>

            <form action={setStatusAction}>
              <input type="hidden" name="conversationId" value={conversation.id} />
              <AutoSubmitSelect
                name="status"
                title="Estado de la conversación"
                defaultValue={conversation.status}
                options={CONVERSATION_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                className={`rounded-full border px-2.5 py-1.5 text-xs font-medium outline-none ${status.tone}`}
              />
            </form>

            <form action={assignAction}>
              <input type="hidden" name="conversationId" value={conversation.id} />
              <AutoSubmitSelect
                name="assignedToId"
                title="Agente asignado"
                defaultValue={conversation.assignedToId ?? ""}
                options={[
                  { value: "", label: "Sin asignar" },
                  ...agents.map((agent) => ({ value: agent.id, label: agent.name })),
                ]}
                className="rounded-full border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 outline-none"
              />
            </form>

            <form action={toggleFavoriteAction}>
              <input type="hidden" name="conversationId" value={conversation.id} />
              <button
                type="submit"
                title="Marcar como favorito"
                className={`grid h-8 w-8 place-items-center rounded-full border transition ${
                  conversation.isFavorite
                    ? "border-amber-200 bg-amber-50 text-amber-500"
                    : "border-slate-200 text-slate-400 hover:bg-slate-50"
                }`}
              >
                <svg viewBox="0 0 24 24" fill={conversation.isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
                  <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8z" />
                </svg>
              </button>
            </form>

            {conversation.unreadCount > 0 ? (
              <form action={markReadAction}>
                <input type="hidden" name="conversationId" value={conversation.id} />
                <button
                  type="submit"
                  className="rounded-full border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50"
                >
                  Marcar leído
                </button>
              </form>
            ) : null}
          </div>
        </header>

        {conversation.aiEnabled ? (
          <p className="bg-brand-soft px-4 py-1.5 text-center text-xs font-medium text-brand">
            La IA responde automáticamente en esta conversación. Desactívala arriba para tomar el control.
          </p>
        ) : null}

        <div className="thin-scroll chat-canvas flex-1 overflow-y-auto px-6 py-5">
          {conversation.messages.length === 0 ? (
            <p className="mt-10 text-center text-sm text-slate-400">Aún no hay mensajes en este chat.</p>
          ) : (
            <ul className="mx-auto flex max-w-3xl flex-col gap-1.5">
              {timeline.map(({ message, day, showDay }) => {
                const mine = message.direction === "out";

                return (
                  <li key={message.id}>
                    {showDay ? (
                      <p className="my-4 text-center">
                        <span className="rounded-full bg-white/80 px-3 py-1 font-mono text-[10px] tracking-wide text-slate-500 uppercase">
                          {day}
                        </span>
                      </p>
                    ) : null}

                    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-[0_1px_1px_rgba(11,29,38,0.08)] ${
                          mine ? "rounded-br-md bg-brand-soft text-ink" : "rounded-bl-md bg-white text-ink"
                        }`}
                      >
                        {message.mediaUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={message.mediaUrl}
                            alt={message.fileName ?? "Adjunto"}
                            className="mb-2 max-h-64 rounded-xl object-cover"
                          />
                        ) : null}
                        <p className="whitespace-pre-wrap">{message.body}</p>
                        <p className="mt-1 flex items-center justify-end gap-1.5 font-mono text-[10px] text-slate-400">
                          {message.aiGenerated ? <span className="text-brand">IA</span> : null}
                          {message.botGenerated ? <span className="text-slate-400">BOT</span> : null}
                          {mine && message.sender ? <span>{message.sender.name.split(" ")[0]}</span> : null}
                          <time title={dateTime(message.createdAt)}>{timeOnly(message.createdAt)}</time>
                          {mine ? (
                            <span
                              className={
                                message.status === "failed"
                                  ? "text-rose-500"
                                  : message.status === "read"
                                    ? "text-brand"
                                    : ""
                              }
                            >
                              {message.status === "failed" ? "✕ falló" : message.status === "pending" ? "…" : "✓✓"}
                            </span>
                          ) : null}
                        </p>
                        {message.error ? <p className="mt-1 text-[10px] text-rose-500">{message.error}</p> : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Composer
          conversationId={conversation.id}
          quickReplies={quickReplies.map((q) => ({ id: q.id, shortcut: q.shortcut, title: q.title, body: q.body }))}
          aiEnabled={conversation.aiEnabled}
        />
      </main>

      <ContactPanel conversationId={conversation.id} contactId={conversation.contactId} currentUser={user} />
    </div>
  );
}
