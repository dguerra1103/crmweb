import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/format";
import { publish } from "@/lib/events";
import { sendText } from "@/lib/messaging";
import { logActivity } from "@/lib/activity";

export type AutomationAction = { type: string; value?: string };

export type AutomationContext = {
  conversationId?: string;
  contactId?: string;
  text?: string;
  tagId?: string;
  stageId?: string;
  orderId?: string;
};

type Conditions = {
  keywords?: string;
  stageId?: string;
  tagId?: string;
  onlyUnassigned?: boolean;
};

/** Reemplaza variables tipo {{nombre}} en los mensajes de automatizaciones y campañas. */
export function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value == null ? "" : String(value);
  });
}

async function conditionsPass(conditions: Conditions, ctx: AutomationContext) {
  if (conditions.keywords) {
    const keys = conditions.keywords
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    const body = (ctx.text ?? "").toLowerCase();
    if (keys.length > 0 && !keys.some((k) => body.includes(k))) return false;
  }

  if (conditions.stageId && ctx.contactId) {
    const contact = await prisma.contact.findUnique({ where: { id: ctx.contactId } });
    if (contact?.stageId !== conditions.stageId) return false;
  }

  if (conditions.tagId && ctx.contactId) {
    const tagged = await prisma.contactTag.findUnique({
      where: { contactId_tagId: { contactId: ctx.contactId, tagId: conditions.tagId } },
    });
    if (!tagged) return false;
  }

  if (conditions.onlyUnassigned && ctx.conversationId) {
    const conversation = await prisma.conversation.findUnique({ where: { id: ctx.conversationId } });
    if (conversation?.assignedToId) return false;
  }

  return true;
}

/** Ejecuta la lista de acciones de una regla o automatización. */
export async function applyActions(actions: AutomationAction[], ctx: AutomationContext) {
  for (const action of actions) {
    try {
      switch (action.type) {
        case "send_message": {
          if (!ctx.conversationId || !action.value) break;
          const contact = ctx.contactId ? await prisma.contact.findUnique({ where: { id: ctx.contactId } }) : null;
          const body = renderTemplate(action.value, {
            nombre: contact?.name?.split(" ")[0] ?? "",
            nombre_completo: contact?.name ?? "",
            telefono: contact?.phone ?? "",
          });
          await sendText({ conversationId: ctx.conversationId, body, botGenerated: true });
          break;
        }
        case "add_tag": {
          if (!ctx.contactId || !action.value) break;
          await prisma.contactTag.upsert({
            where: { contactId_tagId: { contactId: ctx.contactId, tagId: action.value } },
            create: { contactId: ctx.contactId, tagId: action.value },
            update: {},
          });
          await runAutomations("tag_added", { ...ctx, tagId: action.value });
          break;
        }
        case "set_stage": {
          if (!ctx.contactId || !action.value) break;
          await prisma.contact.update({ where: { id: ctx.contactId }, data: { stageId: action.value } });
          break;
        }
        case "assign_agent": {
          if (!ctx.conversationId || !action.value) break;
          await prisma.conversation.update({
            where: { id: ctx.conversationId },
            data: { assignedToId: action.value },
          });
          if (ctx.contactId) {
            await prisma.contact.update({ where: { id: ctx.contactId }, data: { ownerId: action.value } });
          }
          break;
        }
        case "create_task": {
          if (!action.value) break;
          await prisma.task.create({
            data: {
              title: action.value,
              contactId: ctx.contactId ?? null,
              conversationId: ctx.conversationId ?? null,
              dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });
          break;
        }
        case "set_status": {
          if (!ctx.conversationId || !action.value) break;
          await prisma.conversation.update({
            where: { id: ctx.conversationId },
            data: { status: action.value },
          });
          break;
        }
        case "toggle_ai": {
          if (!ctx.conversationId) break;
          await prisma.conversation.update({
            where: { id: ctx.conversationId },
            data: { aiEnabled: action.value === "on" },
          });
          break;
        }
        default:
          break;
      }
    } catch (error) {
      await logActivity({
        action: "automation.error",
        summary: `Falló la acción ${action.type}: ${error instanceof Error ? error.message : "error"}`,
      });
    }
  }

  if (ctx.conversationId) publish({ type: "conversation", conversationId: ctx.conversationId });
}

/** Dispara todas las automatizaciones activas para un evento. */
export async function runAutomations(trigger: string, ctx: AutomationContext) {
  const automations = await prisma.automation.findMany({ where: { enabled: true, trigger } });
  if (automations.length === 0) return;

  for (const automation of automations) {
    const conditions = parseJson<Conditions>(automation.conditions, {});
    if (!(await conditionsPass(conditions, ctx))) continue;

    const actions = parseJson<AutomationAction[]>(automation.actions, []);
    await applyActions(actions, ctx);

    await prisma.automation.update({
      where: { id: automation.id },
      data: { runCount: { increment: 1 }, lastRunAt: new Date() },
    });
  }
}

/**
 * Automatización "sin respuesta": busca conversaciones donde el último mensaje
 * es del cliente y ya pasó el tiempo configurado. Se ejecuta desde /api/cron.
 */
export async function runNoReplySweep(minutes: number) {
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  const conversations = await prisma.conversation.findMany({
    where: { status: { not: "closed" }, lastMessageAt: { lt: cutoff } },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    take: 50,
  });

  let fired = 0;
  for (const conversation of conversations) {
    const last = conversation.messages[0];
    if (!last || last.direction !== "in") continue;
    await runAutomations("no_reply", {
      conversationId: conversation.id,
      contactId: conversation.contactId,
      text: last.body,
    });
    fired++;
  }
  return fired;
}
