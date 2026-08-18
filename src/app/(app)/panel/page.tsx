import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageShell } from "@/components/page-shell";
import { Avatar, Card, CardTitle, EmptyState, PageHeader, Stat } from "@/components/ui";
import { isPast, money, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

function startOfDay(offsetDays = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - offsetDays);
  return date;
}

export default async function DashboardPage() {
  await requireUser();

  const today = startOfDay();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const weekStart = startOfDay(6);

  const [
    messagesToday,
    inboundToday,
    newContactsToday,
    openConversations,
    pendingConversations,
    contactsTotal,
    customers,
    ordersMonth,
    stages,
    agents,
    pendingTasks,
    recentMessages,
  ] = await Promise.all([
    prisma.message.count({ where: { createdAt: { gte: today } } }),
    prisma.message.count({ where: { createdAt: { gte: today }, direction: "in" } }),
    prisma.contact.count({ where: { createdAt: { gte: today } } }),
    prisma.conversation.count({ where: { status: "open" } }),
    prisma.conversation.count({ where: { status: "pending" } }),
    prisma.contact.count(),
    prisma.contact.count({ where: { ordersCount: { gt: 0 } } }),
    prisma.order.aggregate({
      where: { wooCreatedAt: { gte: monthStart }, status: { in: ["completed", "processing"] } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.stage.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { contacts: true } } } }),
    prisma.user.findMany({
      where: { active: true },
      include: {
        _count: { select: { assignedConversations: true, messages: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.task.findMany({
      where: { done: false },
      orderBy: { dueAt: "asc" },
      take: 6,
      include: { contact: true, assignedTo: true },
    }),
    prisma.message.findMany({ where: { createdAt: { gte: weekStart } }, select: { createdAt: true, direction: true } }),
  ]);

  const conversionRate = contactsTotal > 0 ? Math.round((customers / contactsTotal) * 100) : 0;
  const maxStage = Math.max(1, ...stages.map((s) => s._count.contacts));
  const maxAgentMessages = Math.max(1, ...agents.map((a) => a._count.messages));

  // Mensajes por día de los últimos 7 días (una sola serie: no necesita leyenda).
  const days = Array.from({ length: 7 }, (_, i) => startOfDay(6 - i));
  const perDay = days.map((day) => {
    const next = new Date(day.getTime() + 86400000);
    const count = recentMessages.filter((m) => m.createdAt >= day && m.createdAt < next).length;
    return { day, count };
  });
  const maxDay = Math.max(1, ...perDay.map((d) => d.count));

  return (
    <PageShell wide>
      <PageHeader title="Panel" subtitle="Cómo va la operación hoy" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Mensajes hoy" value={String(messagesToday)} hint={`${inboundToday} entrantes`} />
        <Stat label="Chats abiertos" value={String(openConversations)} hint={`${pendingConversations} pendientes`} />
        <Stat label="Clientes nuevos" value={String(newContactsToday)} hint="registrados hoy" />
        <Stat
          label="Ventas del mes"
          value={money(ordersMonth._sum.total ?? 0)}
          hint={`${ordersMonth._count} pedidos`}
        />
        <Stat label="Conversión" value={`${conversionRate}%`} hint={`${customers} de ${contactsTotal} compraron`} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle aside={<span className="font-mono text-xs text-slate-400">últimos 7 días</span>}>
            Mensajes por día
          </CardTitle>
          <div className="px-5 py-5">
            <div className="flex h-40 items-end gap-2">
              {perDay.map(({ day, count }) => (
                <div key={day.toISOString()} className="flex flex-1 flex-col items-center gap-2">
                  <span className="font-mono text-[11px] text-slate-500">{count || ""}</span>
                  <div
                    className="w-full rounded-t-[4px] bg-brand/85"
                    style={{ height: `${Math.max(count > 0 ? 6 : 2, (count / maxDay) * 110)}px` }}
                    title={`${count} mensajes`}
                  />
                  <span className="text-[11px] text-slate-400">
                    {new Intl.DateTimeFormat("es-CO", { weekday: "short" }).format(day)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>Clientes por etapa</CardTitle>
          <ul className="space-y-3 px-5 py-5">
            {stages.map((stage) => (
              <li key={stage.id}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="h-2 w-2 rounded-full" style={{ background: stage.color }} />
                    {stage.name}
                  </span>
                  <span className="font-mono text-slate-500">{stage._count.contacts}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${Math.max(2, (stage._count.contacts / maxStage) * 100)}%`,
                      background: stage.color,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Rendimiento del equipo</CardTitle>
          <ul className="divide-y divide-slate-50">
            {agents.map((agent) => (
              <li key={agent.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={agent.name} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{agent.name}</p>
                  <div className="mt-1.5 h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-brand"
                      style={{ width: `${Math.max(2, (agent._count.messages / maxAgentMessages) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm text-ink">{agent._count.messages}</p>
                  <p className="text-[10px] text-slate-400">
                    mensajes · {agent._count.assignedConversations} chats
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle>Tareas pendientes</CardTitle>
          {pendingTasks.length === 0 ? (
            <EmptyState title="Sin tareas pendientes">Todo el seguimiento está al día.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-50">
              {pendingTasks.map((task) => {
                const overdue = isPast(task.dueAt);
                return (
                  <li key={task.id} className="flex items-start gap-3 px-5 py-3">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${overdue ? "bg-clay" : "bg-slate-300"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{task.title}</p>
                      <p className="text-xs text-slate-400">
                        {task.contact?.name ?? "Sin cliente"} · {task.assignedTo?.name.split(" ")[0] ?? "sin dueño"}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs ${overdue ? "font-medium text-clay" : "text-slate-400"}`}>
                      {task.dueAt ? relativeTime(task.dueAt) : "sin fecha"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
