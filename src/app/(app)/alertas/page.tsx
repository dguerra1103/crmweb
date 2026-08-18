import Link from "next/link";
import type { Route } from "next";
import { requireUser, can } from "@/lib/auth";
import { PageShell } from "@/components/page-shell";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { notificationsFor, countUnread, NOTIFICATION_LABELS } from "@/lib/notifications";
import { markAllReadAction, markNotificationReadAction } from "@/app/actions/notifications";
import { relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AlertsPage({ searchParams }: PageProps<"/alertas">) {
  const user = await requireUser();
  const params = await searchParams;
  const onlyUnread = params.ver !== "todas";

  const seesEverything = can(user, "supervisor");
  const [notifications, unread] = await Promise.all([
    notificationsFor(user.id, onlyUnread, seesEverything),
    countUnread(user.id, seesEverything),
  ]);

  const linkFor = (entityType: string | null, entityId: string | null): Route | null => {
    if (!entityId) return null;
    if (entityType === "conversation") return `/inbox/${entityId}` as Route;
    if (entityType === "campaign") return "/campanas";
    if (entityType === "channel") return "/ajustes";
    if (entityType === "statusPost") return "/estados";
    return null;
  };

  return (
    <PageShell>
      <PageHeader
        title="Alertas y recordatorios"
        subtitle={
          unread > 0
            ? `${unread} sin leer · tareas vencidas, chats sin responder y fallos de envío`
            : "Todo revisado. Aquí aparecen tareas vencidas, chats sin responder y fallos de envío."
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={(onlyUnread ? "/alertas?ver=todas" : "/alertas") as Route}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              {onlyUnread ? "Ver todas" : "Ver solo sin leer"}
            </Link>
            {unread > 0 ? (
              <form action={markAllReadAction}>
                <Button type="submit" variant="ghost">
                  Marcar todo como leído
                </Button>
              </form>
            ) : null}
          </div>
        }
      />

      <Card>
        {notifications.length === 0 ? (
          <EmptyState title={onlyUnread ? "Sin alertas pendientes" : "Sin alertas"}>
            Los avisos se generan solos cuando vence una tarea, un cliente lleva rato esperando o falla un
            envío. El barrido corre con <span className="font-mono">/api/cron</span>.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-50">
            {notifications.map((notification) => {
              const meta = NOTIFICATION_LABELS[notification.kind] ?? {
                label: notification.kind,
                tone: "bg-slate-100 text-slate-600",
              };
              const href = linkFor(notification.entityType, notification.entityId);

              return (
                <li key={notification.id} className="flex items-start gap-3 px-5 py-3">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      notification.readAt ? "bg-slate-200" : "bg-clay"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {href ? (
                        <Link href={href} className="font-medium hover:underline">
                          {notification.title}
                        </Link>
                      ) : (
                        <span className="font-medium">{notification.title}</span>
                      )}
                    </p>
                    {notification.body ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{notification.body}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-slate-400">
                      {relativeTime(notification.createdAt)}
                      {seesEverything && notification.user ? ` · ${notification.user.name}` : ""}
                    </p>
                  </div>

                  {!notification.readAt ? (
                    <form action={markNotificationReadAction}>
                      <input type="hidden" name="notificationId" value={notification.id} />
                      <button type="submit" className="text-[11px] text-slate-400 transition hover:text-brand">
                        Marcar leída
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
