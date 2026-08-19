import { prisma } from "@/lib/db";
import { getChannelBySession, getDefaultChannel, getProviderForConversation } from "@/lib/channel";
import { getSection } from "@/lib/settings";
import { publish } from "@/lib/events";
import { normalizePhone } from "@/lib/format";
import { matchBotRule } from "@/lib/bot";
import { generateConversationReply } from "@/lib/ai";
import { logActivity } from "@/lib/activity";

export type InboundPayload = {
  /** Sesión del worker = línea de WhatsApp por la que entró el mensaje. */
  session?: string;
  phone: string;
  name?: string;
  text?: string;
  type?: "text" | "image" | "audio" | "video" | "document";
  mediaUrl?: string;
  mediaMime?: string;
  fileName?: string;
  externalId?: string;
  channel?: string;
  /** true = lo mandaste tú desde el teléfono/WhatsApp Web, no desde el CRM. */
  fromMe?: boolean;
};

async function defaultStageId() {
  const stage = await prisma.stage.findFirst({ orderBy: { order: "asc" } });
  return stage?.id ?? null;
}

/** Busca o crea el contacto y su conversación activa en una línea. */
export async function ensureConversation(phoneRaw: string, name?: string, channelId?: string | null) {
  const brand = await getSection("brand");
  const phone = normalizePhone(phoneRaw, brand.countryCode);
  if (!phone) throw new Error("Teléfono inválido");

  let contact = await prisma.contact.findUnique({ where: { phone } });
  if (!contact) {
    contact = await prisma.contact.create({
      data: { name: name?.trim() || `+${phone}`, phone, stageId: await defaultStageId() },
    });
    publish({ type: "contact", contactId: contact.id });
  } else if (name && contact.name.startsWith("+")) {
    contact = await prisma.contact.update({ where: { id: contact.id }, data: { name: name.trim() } });
  }

  const lineId = channelId ?? (await getDefaultChannel())?.id ?? null;

  // Un mismo cliente puede escribir a varias líneas: cada línea tiene su hilo.
  let conversation = await prisma.conversation.findFirst({
    where: { contactId: contact.id, ...(lineId ? { channelId: lineId } : {}) },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({ data: { contactId: contact.id, channelId: lineId } });
  }

  return { contact, conversation };
}

/** Entrada de mensajes desde WhatsApp (worker Baileys, Cloud API o simulador). */
export async function handleInbound(payload: InboundPayload) {
  const line = payload.session ? await getChannelBySession(payload.session) : await getDefaultChannel();
  const { contact, conversation } = await ensureConversation(payload.phone, payload.name, line?.id ?? null);

  if (payload.externalId) {
    const dupe = await prisma.message.findFirst({ where: { externalId: payload.externalId } });
    if (dupe) return { duplicated: true, conversationId: conversation.id };
  }

  // Lo mandaste tú desde el teléfono/WhatsApp Web (no desde el CRM): se guarda
  // como saliente, sin bot ni IA, y se marca la conversación como atendida.
  if (payload.fromMe) {
    return handleOutboundFromPhone(payload, contact.id, conversation.id);
  }

  const isFirstMessage = (await prisma.message.count({ where: { conversationId: conversation.id } })) === 0;
  const body = payload.text?.trim() ?? "";

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "in",
      type: payload.type ?? "text",
      body,
      mediaUrl: payload.mediaUrl ?? null,
      mediaMime: payload.mediaMime ?? null,
      fileName: payload.fileName ?? null,
      status: "delivered",
      externalId: payload.externalId ?? null,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: message.createdAt,
      lastMessage: body || `[${message.type}]`,
      unreadCount: { increment: 1 },
      status: conversation.status === "closed" ? "open" : conversation.status,
    },
  });
  await prisma.contact.update({ where: { id: contact.id }, data: { lastContactAt: message.createdAt } });

  publish({ type: "message", conversationId: conversation.id, contactId: contact.id, text: body });

  // Respuesta automática: primero chatbot por reglas, luego IA si está activa.
  await autoRespond(conversation.id, body, isFirstMessage);

  const { runAutomations } = await import("@/lib/automations");
  await runAutomations("message_received", { conversationId: conversation.id, contactId: contact.id, text: body });

  return { duplicated: false, conversationId: conversation.id };
}

/**
 * Registra un mensaje que mandaste tú mismo desde el teléfono/WhatsApp Web,
 * fuera del CRM. No dispara bot ni IA (no es un mensaje del cliente) y baja
 * el contador de "no leídos" a 0, porque ya atendiste esa conversación ahí.
 */
async function handleOutboundFromPhone(payload: InboundPayload, contactId: string, conversationId: string) {
  const body = payload.text?.trim() ?? "";

  const message = await prisma.message.create({
    data: {
      conversationId,
      direction: "out",
      type: payload.type ?? "text",
      body,
      mediaUrl: payload.mediaUrl ?? null,
      mediaMime: payload.mediaMime ?? null,
      fileName: payload.fileName ?? null,
      status: "read",
      externalId: payload.externalId ?? null,
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      lastMessageAt: message.createdAt,
      lastMessage: body || `[${message.type}]`,
      unreadCount: 0,
      // Ya respondiste tú mismo: si estaba pendiente o cerrada, vuelve a abrirse.
      status: "open",
    },
  });

  publish({ type: "message", conversationId, contactId, text: body });
  return { duplicated: false, conversationId };
}

async function autoRespond(conversationId: string, text: string, isFirstMessage: boolean) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return;

  if (conversation.botEnabled) {
    const rule = await matchBotRule(text, isFirstMessage);
    if (rule) {
      await sendText({ conversationId, body: rule.reply, botGenerated: true });
      const { applyActions } = await import("@/lib/automations");
      await applyActions(rule.actions, { conversationId, contactId: conversation.contactId });
      return;
    }
  }

  if (conversation.aiEnabled) {
    const ai = await getSection("ai");
    if (!ai.autoReply) return;
    const result = await generateConversationReply(conversationId);
    if (result.ok && result.text) {
      await sendText({ conversationId, body: result.text, aiGenerated: true });
      if (result.handoff) {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { status: "pending", aiEnabled: false },
        });
        publish({ type: "conversation", conversationId });
      }
    } else if (result.error) {
      await prisma.conversation.update({ where: { id: conversationId }, data: { status: "pending" } });
      publish({ type: "notice", conversationId, text: `IA: ${result.error}` });
    }
  }
}

export type OutboundInput = {
  conversationId: string;
  body: string;
  userId?: string;
  aiGenerated?: boolean;
  botGenerated?: boolean;
  mediaUrl?: string;
  mediaType?: "image" | "document" | "audio" | "video";
  fileName?: string;
};

/** Envía un mensaje al cliente a través del canal activo y lo guarda en el hilo. */
export async function sendText(input: OutboundInput) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    include: { contact: true },
  });
  if (!conversation) throw new Error("Conversación no encontrada");

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "out",
      type: input.mediaUrl ? (input.mediaType ?? "image") : "text",
      body: input.body,
      mediaUrl: input.mediaUrl ?? null,
      fileName: input.fileName ?? null,
      status: "pending",
      senderUserId: input.userId ?? null,
      aiGenerated: Boolean(input.aiGenerated),
      botGenerated: Boolean(input.botGenerated),
    },
  });

  const line = await getProviderForConversation(conversation.id);
  const result = line
    ? await line.provider.send({
        to: conversation.contact.phone,
        text: input.body,
        mediaUrl: input.mediaUrl,
        mediaType: input.mediaType,
        fileName: input.fileName,
      })
    : { ok: false, error: "No hay ninguna línea de WhatsApp configurada." };

  await prisma.message.update({
    where: { id: message.id },
    data: {
      status: result.ok ? "sent" : "failed",
      externalId: result.externalId ?? null,
      error: result.error ?? null,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), lastMessage: input.body || "[archivo]" },
  });

  publish({ type: "message", conversationId: conversation.id, contactId: conversation.contactId });

  if (!result.ok) {
    const { notify } = await import("@/lib/notifications");
    const { explainSendError } = await import("@/lib/notifications");
    await notify({
      userId: input.userId ?? conversation.assignedToId,
      kind: "send_failed",
      title: `No se pudo enviar a ${conversation.contact.name}`,
      body: explainSendError(result.error),
      entityType: "conversation",
      entityId: conversation.id,
    });
  }

  if (input.userId) {
    await logActivity({
      userId: input.userId,
      action: "message.sent",
      summary: `Envió un mensaje a ${conversation.contact.name}`,
      entityType: "conversation",
      entityId: conversation.id,
    });
  }

  return { ok: result.ok, error: result.error, messageId: message.id };
}

/** Envía a un teléfono suelto (campañas, automatizaciones sin hilo abierto). */
export async function sendToPhone(
  phone: string,
  body: string,
  opts: { mediaUrl?: string; channelId?: string | null } = {},
) {
  const { conversation } = await ensureConversation(phone, undefined, opts.channelId ?? null);
  return sendText({ conversationId: conversation.id, body, mediaUrl: opts.mediaUrl });
}

export async function markConversationRead(conversationId: string) {
  await prisma.conversation.update({ where: { id: conversationId }, data: { unreadCount: 0 } });
  publish({ type: "conversation", conversationId });
}
