import { prisma } from "@/lib/db";
import { getProviderFor } from "@/lib/channel";
import { notify } from "@/lib/notifications";
import { logActivity } from "@/lib/activity";

export type StatusAudience = {
  scope: "all" | "customers" | "tags" | "stages";
  tagIds?: string[];
  stageIds?: string[];
};

/** Contactos que verán el estado. WhatsApp solo lo muestra a quienes tengan tu número guardado. */
export async function resolveStatusAudience(audience: StatusAudience) {
  const where: Record<string, unknown> = { isBlocked: false };

  if (audience.scope === "customers") where.ordersCount = { gt: 0 };
  if (audience.scope === "tags" && audience.tagIds?.length) {
    where.tags = { some: { tagId: { in: audience.tagIds } } };
  }
  if (audience.scope === "stages" && audience.stageIds?.length) {
    where.stageId = { in: audience.stageIds };
  }

  return prisma.contact.findMany({ where, select: { id: true, phone: true } });
}

/** Publica un estado de WhatsApp desde una línea y lo guarda en el historial del CRM. */
export async function publishStatus(input: {
  channelId: string;
  authorId?: string;
  body: string;
  mediaUrl?: string | null;
  background?: string | null;
  audience: StatusAudience;
}) {
  const channel = await prisma.channel.findUniqueOrThrow({ where: { id: input.channelId } });
  const contacts = await resolveStatusAudience(input.audience);

  if (contacts.length === 0) {
    return { ok: false as const, error: "El público elegido no tiene contactos." };
  }

  const post = await prisma.statusPost.create({
    data: {
      channelId: channel.id,
      authorId: input.authorId ?? null,
      body: input.body,
      mediaUrl: input.mediaUrl ?? null,
      background: input.background ?? null,
      audience: JSON.stringify(input.audience),
      recipients: contacts.length,
      status: "pending",
    },
  });

  const result = await getProviderFor(channel).postStatus({
    text: input.body,
    mediaUrl: input.mediaUrl ?? undefined,
    background: input.background ?? undefined,
    recipients: contacts.map((c) => c.phone),
  });

  await prisma.statusPost.update({
    where: { id: post.id },
    data: {
      status: result.ok ? "sent" : "failed",
      delivered: result.ok ? (result.recipients ?? contacts.length) : 0,
      error: result.error ?? null,
    },
  });

  if (result.ok) {
    await logActivity({
      userId: input.authorId,
      action: "status.published",
      summary: `Publicó un estado de WhatsApp para ${contacts.length} contactos`,
      entityType: "statusPost",
      entityId: post.id,
    });
  } else {
    await notify({
      userId: input.authorId,
      kind: "status_post",
      title: "No se pudo publicar el estado",
      body: result.error ?? "WhatsApp rechazó la publicación.",
      entityType: "statusPost",
      entityId: post.id,
    });
  }

  return result.ok
    ? { ok: true as const, recipients: contacts.length, postId: post.id }
    : { ok: false as const, error: result.error ?? "No se pudo publicar el estado." };
}
