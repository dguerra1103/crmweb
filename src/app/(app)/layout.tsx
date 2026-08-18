import { prisma } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { logout } from "@/app/actions/auth";
import { AppRail, type RailItem } from "@/components/app-rail";
import { LiveRefresh } from "@/components/live-refresh";
import { Avatar } from "@/components/ui";
import { ROLES } from "@/lib/constants";
import { countUnread } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  const [unread, unreadAlerts] = await Promise.all([
    prisma.conversation.aggregate({
      _sum: { unreadCount: true },
      where: user.role === "agent" ? { OR: [{ assignedToId: user.id }, { assignedToId: null }] } : {},
    }),
    countUnread(user.id, can(user, "supervisor")),
  ]);

  const items: RailItem[] = [
    { href: "/inbox", label: "Conversaciones", icon: "inbox", badge: unread._sum.unreadCount ?? 0 },
    { href: "/contactos", label: "Clientes", icon: "users" },
    { href: "/embudo", label: "Embudo de ventas", icon: "funnel" },
    { href: "/productos", label: "Productos", icon: "box" },
    { href: "/panel", label: "Panel", icon: "chart" },
    { href: "/alertas", label: "Alertas y recordatorios", icon: "bell", badge: unreadAlerts },
  ];

  if (can(user, "supervisor")) {
    items.push(
      { href: "/campanas", label: "Campañas", icon: "send" },
      { href: "/estados", label: "Estados de WhatsApp", icon: "megaphone" },
      { href: "/automatizaciones", label: "Automatizaciones", icon: "bolt" },
      { href: "/ia", label: "Asistente IA", icon: "spark" },
      { href: "/actividad", label: "Actividad del equipo", icon: "history" },
    );
  }
  if (can(user, "admin")) items.push({ href: "/ajustes", label: "Ajustes", icon: "gear" });

  const roleLabel = ROLES.find((r) => r.value === user.role)?.label ?? user.role;

  return (
    <div className="flex h-full">
      <LiveRefresh />
      <AppRail
        items={items}
        footer={
          <div className="flex flex-col items-center gap-2">
            <div className="group relative">
              <Avatar name={user.name} size={36} />
              <div className="pointer-events-none absolute bottom-0 left-[46px] z-30 hidden w-44 rounded-xl bg-ink-soft p-3 text-white shadow-xl group-hover:block">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-slate-400">{roleLabel}</p>
              </div>
            </div>
            <form action={logout}>
              <button
                type="submit"
                title="Cerrar sesión"
                className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 transition hover:bg-white/8 hover:text-white"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
                  <path d="M15 12H4m0 0 3.5-3.5M4 12l3.5 3.5M10 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-2" />
                </svg>
              </button>
            </form>
          </div>
        }
      />
      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
