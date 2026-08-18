import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ConversationList } from "./conversation-list";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const user = await requireUser();
  const params = await searchParams;
  const filter = typeof params.filter === "string" ? params.filter : "todos";
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const lineId = typeof params.linea === "string" ? params.linea : "";

  const [open, pending, unread] = await Promise.all([
    prisma.conversation.count({ where: { status: "open" } }),
    prisma.conversation.count({ where: { status: "pending" } }),
    prisma.conversation.count({ where: { unreadCount: { gt: 0 } } }),
  ]);

  return (
    <div className="flex h-full">
      <ConversationList user={user} filter={filter} q={q} lineId={lineId} />

      <main className="chat-canvas flex flex-1 items-center justify-center p-10">
        <div className="max-w-sm text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="1.5" className="h-7 w-7">
              <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-5 4z" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-ink">Elige una conversación</h2>
          <p className="mt-1 text-sm text-slate-500">
            {unread > 0
              ? `Tienes ${unread} chat(s) sin leer.`
              : "Todo al día. Abre un chat para ver la ficha del cliente."}
          </p>
          <p className="mt-6 font-mono text-xs text-slate-400">
            {open} abiertas · {pending} pendientes
          </p>
        </div>
      </main>
    </div>
  );
}
