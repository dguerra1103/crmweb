"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { publishStatus, resolveStatusAudience, type StatusAudience } from "@/lib/status-posts";

export type StatusState = { ok?: string; error?: string };

function audienceFromForm(fd: FormData): StatusAudience {
  const scope = (String(fd.get("scope") ?? "all") || "all") as StatusAudience["scope"];
  return {
    scope,
    tagIds: fd.getAll("tagIds").map(String).filter(Boolean),
    stageIds: fd.getAll("stageIds").map(String).filter(Boolean),
  };
}

export async function publishStatusAction(_prev: StatusState, fd: FormData): Promise<StatusState> {
  const user = await requireRole("supervisor");

  const body = String(fd.get("body") ?? "").trim();
  const mediaUrl = String(fd.get("mediaUrl") ?? "").trim();
  if (!body && !mediaUrl) return { error: "Escribe un texto o pon la URL de una imagen." };

  const channelId = String(fd.get("channelId") ?? "");
  if (!channelId) return { error: "Elige la línea desde la que se publica." };

  const result = await publishStatus({
    channelId,
    authorId: user.id,
    body,
    mediaUrl: mediaUrl || null,
    background: String(fd.get("background") ?? "#0f766e"),
    audience: audienceFromForm(fd),
  });

  revalidatePath("/", "layout");
  return result.ok
    ? { ok: `Estado publicado para ${result.recipients} contactos.` }
    : { error: result.error };
}

/** Cuenta cuántos contactos verían el estado con el público elegido. */
export async function previewAudienceAction(_prev: StatusState, fd: FormData): Promise<StatusState> {
  await requireRole("supervisor");
  const contacts = await resolveStatusAudience(audienceFromForm(fd));
  return { ok: `${contacts.length} contactos verían este estado.` };
}

export async function deleteStatusPostAction(fd: FormData) {
  await requireRole("supervisor");
  await prisma.statusPost.delete({ where: { id: String(fd.get("postId") ?? "") } });
  revalidatePath("/", "layout");
}
