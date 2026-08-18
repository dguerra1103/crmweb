import { prisma } from "@/lib/db";

export async function logActivity(input: {
  userId?: string | null;
  action: string;
  summary: string;
  entityType?: string;
  entityId?: string;
  meta?: unknown;
}) {
  await prisma.activity.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      summary: input.summary,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      meta: input.meta ? JSON.stringify(input.meta) : null,
    },
  });
}
