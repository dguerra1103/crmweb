import { prisma } from "@/lib/db";
import { publish } from "@/lib/events";

export type NotificationKind =
  | "task_due"
  | "no_reply"
  | "send_failed"
  | "campaign"
  | "ai_error"
  | "channel"
  | "status_post";

export const NOTIFICATION_LABELS: Record<string, { label: string; tone: string }> = {
  task_due: { label: "Tarea vencida", tone: "bg-clay/10 text-clay" },
  no_reply: { label: "Sin responder", tone: "bg-amber-100 text-amber-700" },
  send_failed: { label: "Envío fallido", tone: "bg-rose-100 text-rose-700" },
  campaign: { label: "Campaña", tone: "bg-sky-100 text-sky-700" },
  ai_error: { label: "IA", tone: "bg-violet-100 text-violet-700" },
  channel: { label: "Línea", tone: "bg-slate-100 text-slate-600" },
  status_post: { label: "Estado", tone: "bg-brand/10 text-brand" },
};

/** Convierte errores técnicos en algo que un vendedor entienda. */
export function explainSendError(error?: string) {
  const raw = (error ?? "").toLowerCase();
  if (!raw) return "WhatsApp rechazó el envío.";
  if (raw.includes("fetch failed") || raw.includes("econnrefused") || raw.includes("worker")) {
    return "El worker de WhatsApp no está corriendo. Abre una terminal y ejecuta: npm run wa";
  }
  if (raw.includes("no está conectada") || raw.includes("not connected")) {
    return "Esa línea no está conectada. Ve a Ajustes → Líneas de WhatsApp y escanea el QR.";
  }
  if (raw.includes("credenciales")) return "Faltan las credenciales de la línea en Ajustes.";
  return error ?? "WhatsApp rechazó el envío.";
}

/**
 * Crea un aviso para un usuario (o para todo el equipo si no se indica).
 * Evita repetir el mismo aviso sobre la misma entidad si sigue sin leerse.
 */
export async function notify(input: {
  userId?: string | null;
  kind: NotificationKind;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
}) {
  if (input.entityId) {
    const duplicate = await prisma.notification.findFirst({
      where: {
        kind: input.kind,
        entityId: input.entityId,
        readAt: null,
        userId: input.userId ?? null,
      },
    });
    if (duplicate) return duplicate;
  }

  const notification = await prisma.notification.create({
    data: {
      userId: input.userId ?? null,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    },
  });

  publish({ type: "notice", text: input.title });
  return notification;
}

/**
 * Avisos visibles para un usuario. Un agente ve los suyos y los del equipo sin
 * dueño; supervisores y administradores ven los de todo el mundo.
 */
function scopeFor(userId: string, seesEverything: boolean) {
  return seesEverything ? {} : { OR: [{ userId }, { userId: null }] };
}

export function notificationsFor(userId: string, onlyUnread = false, seesEverything = false) {
  return prisma.notification.findMany({
    where: {
      ...scopeFor(userId, seesEverything),
      ...(onlyUnread ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { user: true },
  });
}

export function countUnread(userId: string, seesEverything = false) {
  return prisma.notification.count({
    where: { ...scopeFor(userId, seesEverything), readAt: null },
  });
}

/**
 * Revisa tareas vencidas y chats sin respuesta, y genera los avisos.
 * Se llama desde /api/cron.
 */
export async function sweepReminders() {
  const now = new Date();
  let created = 0;

  const overdue = await prisma.task.findMany({
    where: { done: false, dueAt: { lt: now, not: null } },
    include: { contact: true, assignedTo: true },
    take: 50,
  });

  for (const task of overdue) {
    await notify({
      userId: task.assignedToId,
      kind: "task_due",
      title: `Tarea vencida: ${task.title}`,
      body: task.contact ? `Cliente: ${task.contact.name}` : undefined,
      entityType: "task",
      entityId: task.id,
    });
    created++;
  }

  // Chats donde el último mensaje es del cliente y ya pasó una hora.
  const cutoff = new Date(now.getTime() - 60 * 60 * 1000);
  const stale = await prisma.conversation.findMany({
    where: { status: { not: "closed" }, lastMessageAt: { lt: cutoff }, unreadCount: { gt: 0 } },
    include: { contact: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    take: 50,
  });

  for (const conversation of stale) {
    const last = conversation.messages[0];
    if (!last || last.direction !== "in") continue;
    await notify({
      userId: conversation.assignedToId,
      kind: "no_reply",
      title: `${conversation.contact.name} lleva rato esperando respuesta`,
      body: conversation.lastMessage ?? undefined,
      entityType: "conversation",
      entityId: conversation.id,
    });
    created++;
  }

  return created;
}
