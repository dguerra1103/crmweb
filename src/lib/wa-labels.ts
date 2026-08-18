import { prisma } from "@/lib/db";
import { getDefaultChannel, getProviderFor } from "@/lib/channel";
import { publish } from "@/lib/events";
import { logActivity } from "@/lib/activity";

/** Los 20 colores de etiqueta de WhatsApp Business, aproximados a hex. */
const WA_LABEL_COLORS = [
  "#ff9485", "#64c4ff", "#ffd429", "#dfaef0", "#95a4fc", "#5fdba7", "#ff8fbb", "#a0d2a4",
  "#f7b967", "#8ec9d4", "#c9a7f0", "#7ec8a7", "#ffb3b3", "#9bb7ff", "#f0c987", "#b8e0a0",
  "#ffa8d5", "#88d4c4", "#d4b483", "#a8b8d8",
];

export function waColorToHex(index: number | null | undefined) {
  if (index == null || index < 0) return "#0ea5e9";
  return WA_LABEL_COLORS[index % WA_LABEL_COLORS.length];
}

/** Nombre libre cuando WhatsApp manda una etiqueta cuyo nombre ya existe en el CRM. */
async function uniqueName(name: string, waLabelId: string) {
  const clash = await prisma.tag.findFirst({ where: { name, waLabelId: { not: waLabelId } } });
  return clash ? `${name} (WhatsApp)` : name;
}

/** Crea, renombra o borra la etiqueta del CRM a partir de una etiqueta de WhatsApp Business. */
export async function upsertWaLabel(label: {
  id: string;
  name?: string;
  color?: number;
  deleted?: boolean;
}) {
  const existing = await prisma.tag.findUnique({ where: { waLabelId: label.id } });

  if (label.deleted) {
    if (existing) await prisma.tag.delete({ where: { id: existing.id } });
    publish({ type: "contact" });
    return { action: "deleted" as const };
  }

  const name = (label.name ?? "").trim() || `Etiqueta ${label.id}`;
  const color = waColorToHex(label.color);

  if (existing) {
    await prisma.tag.update({
      where: { id: existing.id },
      data: { name: await uniqueName(name, label.id), color, waColor: label.color ?? null },
    });
    publish({ type: "contact" });
    return { action: "updated" as const };
  }

  // Si ya existía una etiqueta manual con el mismo nombre, se adopta en vez de duplicar.
  const sameName = await prisma.tag.findUnique({ where: { name } });
  if (sameName && !sameName.waLabelId) {
    await prisma.tag.update({
      where: { id: sameName.id },
      data: { waLabelId: label.id, color, waColor: label.color ?? null },
    });
    publish({ type: "contact" });
    return { action: "linked" as const };
  }

  await prisma.tag.create({
    data: {
      name: await uniqueName(name, label.id),
      color,
      waLabelId: label.id,
      waColor: label.color ?? null,
    },
  });
  publish({ type: "contact" });
  return { action: "created" as const };
}

/** Aplica en el CRM que en WhatsApp se puso o quitó una etiqueta a un chat. */
export async function applyWaAssociation(input: {
  phone: string;
  labelId: string;
  type: "add" | "remove";
}) {
  const [contact, tag] = await Promise.all([
    prisma.contact.findUnique({ where: { phone: input.phone } }),
    prisma.tag.findUnique({ where: { waLabelId: input.labelId } }),
  ]);
  if (!contact || !tag) return { ok: false as const, reason: "contacto o etiqueta desconocidos" };

  if (input.type === "add") {
    await prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId: contact.id, tagId: tag.id } },
      create: { contactId: contact.id, tagId: tag.id },
      update: {},
    });
  } else {
    await prisma.contactTag.deleteMany({ where: { contactId: contact.id, tagId: tag.id } });
  }

  publish({ type: "contact", contactId: contact.id });
  return { ok: true as const };
}

/**
 * Empuja al teléfono un cambio de etiqueta hecho en el CRM.
 * Solo aplica con el canal por QR y con etiquetas que existen en WhatsApp Business.
 */
export async function pushLabelToWhatsApp(contactId: string, tagId: string, action: "add" | "remove") {
  const [contact, tag] = await Promise.all([
    prisma.contact.findUnique({
      where: { id: contactId },
      include: { conversations: { include: { channelLine: true }, orderBy: { lastMessageAt: "desc" }, take: 1 } },
    }),
    prisma.tag.findUnique({ where: { id: tagId } }),
  ]);
  if (!contact || !tag?.waLabelId) return { ok: false as const, reason: "etiqueta solo del CRM" };

  const channel = contact.conversations[0]?.channelLine ?? (await getDefaultChannel());
  if (!channel) return { ok: false as const, reason: "sin línea de WhatsApp" };

  const result = await getProviderFor(channel).setChatLabel({
    phone: contact.phone,
    labelId: tag.waLabelId,
    action,
  });

  if (!result.ok) {
    await logActivity({
      action: "label.push_failed",
      summary: `No se pudo ${action === "add" ? "poner" : "quitar"} la etiqueta "${tag.name}" en WhatsApp: ${result.error ?? "sin detalle"}`,
      entityType: "contact",
      entityId: contactId,
    });
  }
  return { ok: result.ok, reason: result.error };
}
