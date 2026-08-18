import { prisma } from "@/lib/db";
import { getSection } from "@/lib/settings";
import { publish } from "@/lib/events";
import { normalizePhone } from "@/lib/format";

export type HistoryMessage = {
  externalId: string;
  phone: string;
  name?: string;
  fromMe: boolean;
  text: string;
  type?: string;
  timestamp: number; // segundos, como los manda WhatsApp
};

export type HistoryChat = {
  phone: string;
  name?: string;
  unread?: number;
  archived?: boolean;
};

export type HistoryResult = {
  contactsCreated: number;
  conversationsCreated: number;
  messagesImported: number;
  skipped: number;
};

/** Días de antigüedad hasta los que un chat importado entra a la bandeja abierta. */
const RECENT_DAYS = 30;

async function defaultStageId() {
  const stage = await prisma.stage.findFirst({ orderBy: { order: "asc" } });
  return stage?.id ?? null;
}

/**
 * Importa un lote del historial que WhatsApp envía al vincular el dispositivo.
 * No dispara chatbot, IA ni automatizaciones: son mensajes viejos.
 */
export async function importHistoryBatch(input: {
  chats?: HistoryChat[];
  messages?: HistoryMessage[];
  channelId?: string | null;
}): Promise<HistoryResult> {
  const brand = await getSection("brand");
  const result: HistoryResult = {
    contactsCreated: 0,
    conversationsCreated: 0,
    messagesImported: 0,
    skipped: 0,
  };

  const stageId = await defaultStageId();

  // 1. Nombres conocidos por teléfono (los chats traen el nombre de la agenda).
  const names = new Map<string, string>();
  for (const chat of input.chats ?? []) {
    const phone = normalizePhone(chat.phone, brand.countryCode);
    if (phone && chat.name?.trim()) names.set(phone, chat.name.trim());
  }
  for (const message of input.messages ?? []) {
    const phone = normalizePhone(message.phone, brand.countryCode);
    if (phone && message.name?.trim() && !names.has(phone)) names.set(phone, message.name.trim());
  }

  // 2. Teléfonos que aparecen en este lote.
  const phones = new Set<string>();
  for (const chat of input.chats ?? []) {
    const phone = normalizePhone(chat.phone, brand.countryCode);
    if (phone) phones.add(phone);
  }
  for (const message of input.messages ?? []) {
    const phone = normalizePhone(message.phone, brand.countryCode);
    if (phone) phones.add(phone);
  }
  if (phones.size === 0) return result;

  // 3. Contactos y conversaciones (crea los que falten).
  const existingContacts = await prisma.contact.findMany({ where: { phone: { in: [...phones] } } });
  const contactByPhone = new Map(existingContacts.map((c) => [c.phone, c]));

  for (const phone of phones) {
    if (contactByPhone.has(phone)) continue;
    const contact = await prisma.contact.create({
      data: { name: names.get(phone) ?? `+${phone}`, phone, stageId, source: "whatsapp-historial" },
    });
    contactByPhone.set(phone, contact);
    result.contactsCreated++;
  }

  const contactIds = [...contactByPhone.values()].map((c) => c.id);
  const existingConversations = await prisma.conversation.findMany({
    where: { contactId: { in: contactIds }, ...(input.channelId ? { channelId: input.channelId } : {}) },
  });
  const conversationByContact = new Map(existingConversations.map((c) => [c.contactId, c]));
  const createdHere = new Set<string>();

  for (const contact of contactByPhone.values()) {
    if (conversationByContact.has(contact.id)) continue;
    const conversation = await prisma.conversation.create({
      data: { contactId: contact.id, channelId: input.channelId ?? null, status: "closed", botEnabled: false },
    });
    conversationByContact.set(contact.id, conversation);
    createdHere.add(conversation.id);
    result.conversationsCreated++;
  }

  // 4. Mensajes: se descartan los que ya están (idempotente por externalId).
  const incoming = (input.messages ?? [])
    .map((message) => {
      const phone = normalizePhone(message.phone, brand.countryCode);
      const contact = phone ? contactByPhone.get(phone) : null;
      const conversation = contact ? conversationByContact.get(contact.id) : null;
      if (!conversation || !message.externalId) return null;
      return {
        conversationId: conversation.id,
        direction: message.fromMe ? "out" : "in",
        type: message.type ?? "text",
        body: message.text ?? "",
        status: message.fromMe ? "read" : "delivered",
        externalId: message.externalId,
        imported: true,
        createdAt: new Date(message.timestamp * 1000),
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  if (incoming.length > 0) {
    const existing = await prisma.message.findMany({
      where: { externalId: { in: incoming.map((m) => m.externalId) } },
      select: { externalId: true, conversationId: true },
    });
    const seen = new Set(existing.map((m) => `${m.conversationId}:${m.externalId}`));
    const unique = new Map<string, (typeof incoming)[number]>();
    for (const message of incoming) {
      const key = `${message.conversationId}:${message.externalId}`;
      if (seen.has(key) || unique.has(key)) {
        result.skipped++;
        continue;
      }
      unique.set(key, message);
    }

    if (unique.size > 0) {
      await prisma.message.createMany({ data: [...unique.values()] });
      result.messagesImported = unique.size;
    }
  }

  // 5. Último mensaje y fecha por conversación tocada.
  //    Los chats importados con actividad del último mes entran a la bandeja;
  //    los más viejos quedan como cerrados para no inundarla (siguen buscables).
  const recentCutoff = new Date(Date.now() - RECENT_DAYS * 86400000);

  for (const conversation of conversationByContact.values()) {
    const last = await prisma.message.findFirst({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
    });
    if (!last) continue;
    const isRecent = last.createdAt >= recentCutoff;
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessage: last.body || `[${last.type}]`,
        lastMessageAt: last.createdAt,
        ...(createdHere.has(conversation.id) && isRecent ? { status: "open" } : {}),
      },
    });
    if (last.direction === "in") {
      await prisma.contact.update({
        where: { id: conversation.contactId },
        data: { lastContactAt: last.createdAt },
      });
    }
  }

  publish({ type: "conversation" });
  return result;
}
