"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { runAutomations } from "@/lib/automations";
import { normalizePhone } from "@/lib/format";
import { getSection } from "@/lib/settings";
import { ensureConversation } from "@/lib/messaging";
import { pushLabelToWhatsApp } from "@/lib/wa-labels";

function refresh() {
  revalidatePath("/", "layout");
}

function text(fd: FormData, key: string) {
  const value = fd.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function required(fd: FormData, key: string, label = key) {
  const value = text(fd, key);
  if (!value) throw new Error(`${label} es obligatorio`);
  return value;
}

/* ---------------- Contactos ---------------- */

export async function createContactAction(fd: FormData) {
  const user = await requireUser();
  const brand = await getSection("brand");
  const phone = normalizePhone(required(fd, "phone", "El teléfono"), brand.countryCode);
  if (!phone) throw new Error("Teléfono inválido");

  const existing = await prisma.contact.findUnique({ where: { phone } });
  if (existing) {
    const { conversation } = await ensureConversation(phone);
    refresh();
    redirect(`/inbox/${conversation.id}`);
  }

  const contact = await prisma.contact.create({
    data: {
      name: required(fd, "name", "El nombre"),
      phone,
      email: text(fd, "email"),
      company: text(fd, "company"),
      stageId: text(fd, "stageId"),
      ownerId: text(fd, "ownerId") ?? user.id,
      source: text(fd, "source") ?? "manual",
    },
  });
  const { conversation } = await ensureConversation(contact.phone, contact.name);

  await logActivity({
    userId: user.id,
    action: "contact.created",
    summary: `Creó el cliente ${contact.name}`,
    entityType: "contact",
    entityId: contact.id,
  });
  refresh();
  redirect(`/inbox/${conversation.id}`);
}

export async function updateContactAction(fd: FormData) {
  const user = await requireUser();
  const id = required(fd, "id");
  const contact = await prisma.contact.update({
    where: { id },
    data: {
      name: required(fd, "name", "El nombre"),
      email: text(fd, "email"),
      company: text(fd, "company"),
      ownerId: text(fd, "ownerId"),
    },
  });
  await logActivity({
    userId: user.id,
    action: "contact.updated",
    summary: `Actualizó la ficha de ${contact.name}`,
    entityType: "contact",
    entityId: id,
  });
  refresh();
}

export async function setStageAction(fd: FormData) {
  const user = await requireUser();
  const contactId = required(fd, "contactId");
  const stageId = text(fd, "stageId");

  const contact = await prisma.contact.update({ where: { id: contactId }, data: { stageId } });
  const stage = stageId ? await prisma.stage.findUnique({ where: { id: stageId } }) : null;

  await logActivity({
    userId: user.id,
    action: "contact.stage",
    summary: `Movió a ${contact.name} a ${stage?.name ?? "sin etapa"}`,
    entityType: "contact",
    entityId: contactId,
  });
  await runAutomations("stage_changed", { contactId, stageId: stageId ?? undefined });
  refresh();
}

export async function toggleTagAction(fd: FormData) {
  await requireUser();
  const contactId = required(fd, "contactId");
  const tagId = required(fd, "tagId");

  const existing = await prisma.contactTag.findUnique({
    where: { contactId_tagId: { contactId, tagId } },
  });

  if (existing) {
    await prisma.contactTag.delete({ where: { contactId_tagId: { contactId, tagId } } });
    // Si la etiqueta viene de WhatsApp Business, se quita también en el teléfono.
    await pushLabelToWhatsApp(contactId, tagId, "remove");
  } else {
    await prisma.contactTag.create({ data: { contactId, tagId } });
    await pushLabelToWhatsApp(contactId, tagId, "add");
    await runAutomations("tag_added", { contactId, tagId });
  }
  refresh();
}

export async function toggleBlockAction(fd: FormData) {
  await requireRole("supervisor");
  const id = required(fd, "contactId");
  const contact = await prisma.contact.findUniqueOrThrow({ where: { id } });
  await prisma.contact.update({ where: { id }, data: { isBlocked: !contact.isBlocked } });
  refresh();
}

export async function deleteContactAction(fd: FormData) {
  const user = await requireRole("supervisor");
  const id = required(fd, "contactId");
  const contact = await prisma.contact.delete({ where: { id } });
  await logActivity({
    userId: user.id,
    action: "contact.deleted",
    summary: `Eliminó el cliente ${contact.name}`,
  });
  refresh();
  redirect("/contactos");
}

/* ---------------- Notas internas ---------------- */

export async function createNoteAction(fd: FormData) {
  const user = await requireUser();
  await prisma.note.create({
    data: {
      contactId: required(fd, "contactId"),
      authorId: user.id,
      body: required(fd, "body", "La nota"),
    },
  });
  refresh();
}

export async function deleteNoteAction(fd: FormData) {
  await requireUser();
  await prisma.note.delete({ where: { id: required(fd, "noteId") } });
  refresh();
}

/* ---------------- Tareas ---------------- */

export async function createTaskAction(fd: FormData) {
  const user = await requireUser();
  const dueAt = text(fd, "dueAt");
  await prisma.task.create({
    data: {
      title: required(fd, "title", "El título"),
      details: text(fd, "details"),
      dueAt: dueAt ? new Date(dueAt) : null,
      priority: text(fd, "priority") ?? "medium",
      contactId: text(fd, "contactId"),
      conversationId: text(fd, "conversationId"),
      assignedToId: text(fd, "assignedToId") ?? user.id,
      createdById: user.id,
    },
  });
  refresh();
}

export async function toggleTaskAction(fd: FormData) {
  await requireUser();
  const id = required(fd, "taskId");
  const task = await prisma.task.findUniqueOrThrow({ where: { id } });
  await prisma.task.update({ where: { id }, data: { done: !task.done } });
  refresh();
}

export async function deleteTaskAction(fd: FormData) {
  await requireUser();
  await prisma.task.delete({ where: { id: required(fd, "taskId") } });
  refresh();
}

/* ---------------- Etiquetas y etapas ---------------- */

export async function createTagAction(fd: FormData) {
  await requireRole("supervisor");
  await prisma.tag.create({
    data: { name: required(fd, "name", "El nombre"), color: text(fd, "color") ?? "#0ea5e9" },
  });
  refresh();
}

export async function deleteTagAction(fd: FormData) {
  await requireRole("supervisor");
  await prisma.tag.delete({ where: { id: required(fd, "tagId") } });
  refresh();
}

export async function createStageAction(fd: FormData) {
  await requireRole("admin");
  const count = await prisma.stage.count();
  await prisma.stage.create({
    data: {
      name: required(fd, "name", "El nombre"),
      color: text(fd, "color") ?? "#64748b",
      order: count,
      isWon: fd.get("isWon") === "on",
    },
  });
  refresh();
}

export async function updateStageAction(fd: FormData) {
  await requireRole("admin");
  await prisma.stage.update({
    where: { id: required(fd, "stageId") },
    data: {
      name: required(fd, "name", "El nombre"),
      color: text(fd, "color") ?? "#64748b",
      order: Number(text(fd, "order") ?? 0),
    },
  });
  refresh();
}

export async function deleteStageAction(fd: FormData) {
  await requireRole("admin");
  await prisma.stage.delete({ where: { id: required(fd, "stageId") } });
  refresh();
}
