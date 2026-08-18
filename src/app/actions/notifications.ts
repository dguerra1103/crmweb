"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function markNotificationReadAction(fd: FormData) {
  const user = await requireUser();
  const id = String(fd.get("notificationId") ?? "");
  if (!id) return;

  await prisma.notification.updateMany({
    where: { id, OR: [{ userId: user.id }, { userId: null }] },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
}

export async function markAllReadAction() {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { OR: [{ userId: user.id }, { userId: null }], readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
}
