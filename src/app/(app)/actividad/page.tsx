import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { PageShell } from "@/components/page-shell";
import { Avatar, Card, EmptyState, PageHeader } from "@/components/ui";
import { dateTime, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ActivityPage({ searchParams }: PageProps<"/actividad">) {
  await requireRole("supervisor");
  const params = await searchParams;
  const userId = typeof params.user === "string" ? params.user : "";

  const [activities, users] = await Promise.all([
    prisma.activity.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 150,
      include: { user: true },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <PageShell>
      <PageHeader title="Actividad del equipo" subtitle="Historial de acciones de cada trabajador" />

      <form className="mb-4 flex flex-wrap gap-2">
        <select
          name="user"
          defaultValue={userId}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">Todo el equipo</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-xl bg-ink px-3 py-2 text-sm font-medium text-white">
          Filtrar
        </button>
      </form>

      <Card>
        {activities.length === 0 ? (
          <EmptyState title="Sin actividad registrada">Las acciones del equipo aparecerán aquí.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-50">
            {activities.map((activity) => (
              <li key={activity.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={activity.user?.name ?? "Sistema"} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{activity.summary}</p>
                  <p className="font-mono text-[11px] text-slate-400">{activity.action}</p>
                </div>
                <time className="shrink-0 text-xs text-slate-400" title={dateTime(activity.createdAt)}>
                  {relativeTime(activity.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}
