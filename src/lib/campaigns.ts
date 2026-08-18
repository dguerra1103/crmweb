import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/format";
import { ensureConversation, sendText } from "@/lib/messaging";
import { renderTemplate } from "@/lib/automations";
import { logActivity } from "@/lib/activity";

export type Segment = {
  stageIds?: string[];
  tagIds?: string[];
  ownerId?: string;
  hasOrders?: boolean;
  inactiveDays?: number;
};

/** Contactos que caen dentro del segmento de una campaña. */
export async function resolveSegment(segment: Segment) {
  const where: Record<string, unknown> = { isBlocked: false };

  if (segment.stageIds?.length) where.stageId = { in: segment.stageIds };
  if (segment.ownerId) where.ownerId = segment.ownerId;
  if (segment.hasOrders) where.ordersCount = { gt: 0 };
  if (segment.tagIds?.length) where.tags = { some: { tagId: { in: segment.tagIds } } };
  if (segment.inactiveDays) {
    where.OR = [
      { lastContactAt: { lt: new Date(Date.now() - segment.inactiveDays * 86400000) } },
      { lastContactAt: null },
    ];
  }

  return prisma.contact.findMany({ where, orderBy: { createdAt: "desc" } });
}

export async function prepareCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const contacts = await resolveSegment(parseJson<Segment>(campaign.segment, {}));

  await prisma.campaignRecipient.deleteMany({ where: { campaignId, status: "pending" } });

  // SQLite no soporta skipDuplicates: filtramos los que ya tienen registro.
  const already = await prisma.campaignRecipient.findMany({
    where: { campaignId },
    select: { contactId: true },
  });
  const seen = new Set(already.map((r) => r.contactId));
  const nuevos = contacts.filter((c) => !seen.has(c.id));

  if (nuevos.length > 0) {
    await prisma.campaignRecipient.createMany({
      data: nuevos.map((c) => ({ campaignId, contactId: c.id })),
    });
  }

  return contacts.length;
}

/**
 * Envía un lote de la campaña. Se llama repetidamente desde /api/cron
 * para no saturar el número (riesgo de bloqueo por envío masivo).
 */
export async function dispatchCampaignBatch(campaignId: string, batchSize = 5) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status !== "running") return { sent: 0, failed: 0, remaining: 0 };

  const pending = await prisma.campaignRecipient.findMany({
    where: { campaignId, status: "pending" },
    include: { contact: true },
    take: batchSize,
  });

  let sent = 0;
  let failed = 0;

  for (const recipient of pending) {
    const body = renderTemplate(campaign.body, {
      nombre: recipient.contact.name.split(" ")[0],
      nombre_completo: recipient.contact.name,
      telefono: recipient.contact.phone,
    });

    try {
      const { conversation } = await ensureConversation(
        recipient.contact.phone,
        recipient.contact.name,
        campaign.channelId,
      );
      const result = await sendText({
        conversationId: conversation.id,
        body,
        mediaUrl: campaign.mediaUrl ?? undefined,
      });

      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: result.ok ? "sent" : "failed",
          error: result.error ?? null,
          sentAt: new Date(),
        },
      });
      if (result.ok) sent++;
      else failed++;
    } catch (error) {
      failed++;
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: "failed", error: error instanceof Error ? error.message : "error", sentAt: new Date() },
      });
    }
  }

  const remaining = await prisma.campaignRecipient.count({ where: { campaignId, status: "pending" } });

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      sentCount: { increment: sent },
      failedCount: { increment: failed },
      status: remaining === 0 ? "done" : "running",
      finishedAt: remaining === 0 ? new Date() : null,
    },
  });

  if (remaining === 0) {
    await logActivity({
      action: "campaign.finished",
      summary: `Campaña "${campaign.name}" terminada`,
      entityType: "campaign",
      entityId: campaignId,
    });
    const { notify } = await import("@/lib/notifications");
    await notify({
      kind: "campaign",
      title: `Campaña "${campaign.name}" terminada`,
      body: `${campaign.sentCount + sent} enviados · ${campaign.failedCount + failed} fallidos`,
      entityType: "campaign",
      entityId: campaignId,
    });
  }

  return { sent, failed, remaining };
}

/** Arranca campañas programadas cuya hora ya llegó y procesa las que están corriendo. */
export async function tickCampaigns() {
  const now = new Date();

  await prisma.campaign.updateMany({
    where: { status: "scheduled", scheduledAt: { lte: now } },
    data: { status: "running", startedAt: now },
  });

  const running = await prisma.campaign.findMany({ where: { status: "running" }, take: 3 });
  let sent = 0;
  for (const campaign of running) {
    const result = await dispatchCampaignBatch(campaign.id);
    sent += result.sent;
  }
  return sent;
}
