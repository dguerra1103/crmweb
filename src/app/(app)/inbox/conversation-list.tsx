import Link from "next/link";
import type { Route } from "next";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { Avatar } from "@/components/ui";
import { relativeTime } from "@/lib/format";

const FILTERS = [
  { value: "todos", label: "Todos" },
  { value: "no-leidos", label: "No leídos" },
  { value: "mios", label: "Míos" },
  { value: "pendientes", label: "Pendientes" },
  { value: "favoritos", label: "Favoritos" },
  { value: "cerrados", label: "Cerrados" },
] as const;

function whereFor(filter: string, user: SessionUser, q: string, lineId: string) {
  const base: Record<string, unknown> = {};
  if (lineId) base.channelId = lineId;

  switch (filter) {
    case "no-leidos":
      base.unreadCount = { gt: 0 };
      break;
    case "mios":
      base.assignedToId = user.id;
      break;
    case "pendientes":
      base.status = "pending";
      break;
    case "favoritos":
      base.isFavorite = true;
      break;
    case "cerrados":
      base.status = "closed";
      break;
    default:
      base.status = { not: "closed" };
  }

  if (q) {
    base.contact = {
      OR: [{ name: { contains: q } }, { phone: { contains: q.replace(/\D/g, "") || q } }],
    };
  }

  return base;
}

export async function ConversationList({
  user,
  activeId,
  filter,
  q,
  lineId = "",
}: {
  user: SessionUser;
  activeId?: string;
  filter: string;
  q: string;
  lineId?: string;
}) {
  const [conversations, lines] = await Promise.all([
    prisma.conversation.findMany({
      where: whereFor(filter, user, q, lineId),
      include: {
        contact: { include: { stage: true, tags: { include: { tag: true } } } },
        assignedTo: true,
        channelLine: true,
      },
      orderBy: { lastMessageAt: "desc" },
      take: 80,
    }),
    prisma.channel.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
  ]);

  const link = (id: string) => {
    const params = new URLSearchParams();
    if (filter !== "todos") params.set("filter", filter);
    if (q) params.set("q", q);
    if (lineId) params.set("linea", lineId);
    const qs = params.toString();
    return (qs ? `/inbox/${id}?${qs}` : `/inbox/${id}`) as Route;
  };

  return (
    <aside className="flex h-full w-[330px] shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight text-ink">Conversaciones</h1>
          <Link
            href="/contactos/nuevo"
            className="rounded-lg bg-brand px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-brand/90"
          >
            Nuevo chat
          </Link>
        </div>

        <form className="mt-3">
          {filter !== "todos" ? <input type="hidden" name="filter" value={filter} /> : null}
          <div className="relative">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-400"
            >
              <circle cx="11" cy="11" r="6" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar cliente o teléfono"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-sm outline-none focus:border-brand focus:bg-white"
            />
          </div>
        </form>

        <div className="thin-scroll -mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-1">
          {FILTERS.map((f) => {
            const params = new URLSearchParams();
            if (f.value !== "todos") params.set("filter", f.value);
            if (q) params.set("q", q);
            if (lineId) params.set("linea", lineId);
            const href = (params.toString() ? `/inbox?${params}` : "/inbox") as Route;
            const active = filter === f.value;
            return (
              <Link
                key={f.value}
                href={href}
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  active ? "bg-ink text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
        </div>
      </div>

      {lines.length > 1 ? (
        <div className="thin-scroll flex gap-1 overflow-x-auto border-b border-slate-100 px-4 py-2">
          {[{ id: "", name: "Todas las líneas", color: "#94a3b8" }, ...lines].map((line) => {
            const params = new URLSearchParams();
            if (filter !== "todos") params.set("filter", filter);
            if (q) params.set("q", q);
            if (line.id) params.set("linea", line.id);
            const href = (params.toString() ? `/inbox?${params}` : "/inbox") as Route;
            const active = lineId === line.id;
            return (
              <Link
                key={line.id || "todas"}
                href={href}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  active ? "bg-slate-100 text-ink" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: line.color }} />
                {line.name}
              </Link>
            );
          })}
        </div>
      ) : null}

      <div className="thin-scroll flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            No hay conversaciones con este filtro.
          </p>
        ) : (
          <ul>
            {conversations.map((conversation) => {
              const active = conversation.id === activeId;
              return (
                <li key={conversation.id}>
                  <Link
                    href={link(conversation.id)}
                    className={`flex gap-3 border-b border-slate-50 px-4 py-3 transition ${
                      active ? "bg-brand-soft/60" : "hover:bg-slate-50"
                    }`}
                  >
                    <Avatar name={conversation.contact.name} size={42} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-ink">{conversation.contact.name}</p>
                        <time className="shrink-0 font-mono text-[10px] text-slate-400">
                          {relativeTime(conversation.lastMessageAt)}
                        </time>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {conversation.lastMessage ?? "Sin mensajes"}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        {lines.length > 1 && conversation.channelLine ? (
                          <span
                            title={conversation.channelLine.name}
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: conversation.channelLine.color }}
                          />
                        ) : null}
                        {conversation.contact.stage ? (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                            style={{
                              background: `${conversation.contact.stage.color}1a`,
                              color: conversation.contact.stage.color,
                            }}
                          >
                            {conversation.contact.stage.name}
                          </span>
                        ) : null}
                        {conversation.aiEnabled ? (
                          <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                            IA
                          </span>
                        ) : null}
                        {conversation.status === "pending" ? (
                          <span className="rounded-full bg-clay/10 px-1.5 py-0.5 text-[10px] font-medium text-clay">
                            Pendiente
                          </span>
                        ) : null}
                        {conversation.assignedTo ? (
                          <span className="truncate text-[10px] text-slate-400">
                            {conversation.assignedTo.name.split(" ")[0]}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {conversation.unreadCount > 0 ? (
                      <span className="mt-1 h-5 min-w-5 self-start rounded-full bg-brand px-1.5 text-center font-mono text-[11px] leading-5 font-semibold text-white">
                        {conversation.unreadCount}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
