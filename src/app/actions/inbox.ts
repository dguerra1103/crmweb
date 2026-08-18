"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { sendText, markConversationRead } from "@/lib/messaging";
import { generateConversationReply, summarizeConversation } from "@/lib/ai";
import { publish } from "@/lib/events";
import { logActivity } from "@/lib/activity";
import { runAutomations } from "@/lib/automations";

function refresh() {
  revalidatePath("/", "layout");
}

function text(fd: FormData, key: string) {
  const value = fd.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function required(fd: FormData, key: string) {
  const value = text(fd, key);
  if (!value) throw new Error(`Falta el campo ${key}`);
  return value;
}

export type ComposerState = { error?: string; suggestion?: string };

/** Enviar mensaje desde el hilo. */
export async function sendMessageAction(_prev: ComposerState, fd: FormData): Promise<ComposerState> {
  const user = await requireUser();
  const conversationId = required(fd, "conversationId");
  const body = text(fd, "body");
  if (!body) return { error: "Escribe un mensaje antes de enviarlo." };

  const result = await sendText({ conversationId, body, userId: user.id });
  refresh();
  return result.ok ? {} : { error: result.error ?? "No se pudo enviar el mensaje." };
}

/** Pedirle a la IA una respuesta sugerida, sin enviarla. */
export async function suggestReplyAction(_prev: ComposerState, fd: FormData): Promise<ComposerState> {
  await requireUser();
  const conversationId = required(fd, "conversationId");
  const result = await generateConversationReply(conversationId);
  return result.ok && result.text ? { suggestion: result.text } : { error: result.error ?? "La IA no respondió." };
}

export async function summarizeAction(_prev: ComposerState, fd: FormData): Promise<ComposerState> {
  await requireUser();
  const result = await summarizeConversation(required(fd, "conversationId"));
  return result.ok && result.text ? { suggestion: result.text } : { error: result.error ?? "La IA no respondió." };
}

export async function toggleAiAction(fd: FormData) {
  const user = await requireUser();
  const id = required(fd, "conversationId");
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id } });
  await prisma.conversation.update({ where: { id }, data: { aiEnabled: !conversation.aiEnabled } });
  await logActivity({
    userId: user.id,
    action: "conversation.ai",
    summary: `${conversation.aiEnabled ? "Desactivó" : "Activó"} la IA en una conversación`,
    entityType: "conversation",
    entityId: id,
  });
  publish({ type: "conversation", conversationId: id });
  refresh();
}

export async function toggleBotAction(fd: FormData) {
  await requireUser();
  const id = required(fd, "conversationId");
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id } });
  await prisma.conversation.update({ where: { id }, data: { botEnabled: !conversation.botEnabled } });
  refresh();
}

export async function toggleFavoriteAction(fd: FormData) {
  await requireUser();
  const id = required(fd, "conversationId");
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id } });
  await prisma.conversation.update({ where: { id }, data: { isFavorite: !conversation.isFavorite } });
  await prisma.contact.update({
    where: { id: conversation.contactId },
    data: { isFavorite: !conversation.isFavorite },
  });
  refresh();
}

export async function setStatusAction(fd: FormData) {
  const user = await requireUser();
  const id = required(fd, "conversationId");
  const status = required(fd, "status");
  await prisma.conversation.update({ where: { id }, data: { status } });
  await logActivity({
    userId: user.id,
    action: "conversation.status",
    summary: `Cambió una conversación a ${status}`,
    entityType: "conversation",
    entityId: id,
  });
  publish({ type: "conversation", conversationId: id });
  refresh();
}

export async function assignAction(fd: FormData) {
  const user = await requireUser();
  const id = required(fd, "conversationId");
  const assignedToId = text(fd, "assignedToId");
  const conversation = await prisma.conversation.update({
    where: { id },
    data: { assignedToId },
    include: { contact: true, assignedTo: true },
  });
  await prisma.contact.update({ where: { id: conversation.contactId }, data: { ownerId: assignedToId } });
  await logActivity({
    userId: user.id,
    action: "conversation.assign",
    summary: `Asignó ${conversation.contact.name} a ${conversation.assignedTo?.name ?? "nadie"}`,
    entityType: "conversation",
    entityId: id,
  });
  publish({ type: "conversation", conversationId: id });
  refresh();
}

export async function markReadAction(fd: FormData) {
  await requireUser();
  await markConversationRead(required(fd, "conversationId"));
  refresh();
}

/** Enviar una ficha de producto (imagen + precio + enlace) al cliente. */
export async function sendProductAction(fd: FormData) {
  const user = await requireUser();
  const conversationId = required(fd, "conversationId");
  const product = await prisma.product.findUniqueOrThrow({ where: { id: required(fd, "productId") } });

  const lines = [
    `*${product.name}*`,
    `Precio: ${new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(product.price)}`,
    product.stockStatus === "instock" ? "Disponible ✅" : "Agotado ❌",
    product.permalink ?? "",
  ].filter(Boolean);

  await sendText({
    conversationId,
    body: lines.join("\n"),
    userId: user.id,
    mediaUrl: product.imageUrl ?? undefined,
    mediaType: "image",
  });
  refresh();
}

/** Simulador: inyecta un mensaje entrante para probar bot, IA y automatizaciones. */
export async function simulateInboundAction(fd: FormData) {
  await requireUser();
  const { handleInbound } = await import("@/lib/messaging");
  await handleInbound({
    phone: required(fd, "phone"),
    name: text(fd, "name") ?? undefined,
    text: required(fd, "body"),
  });
  refresh();
}

export async function runTriggerAction(fd: FormData) {
  await requireUser();
  const conversationId = required(fd, "conversationId");
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  await runAutomations("message_received", {
    conversationId,
    contactId: conversation.contactId,
    text: conversation.lastMessage ?? "",
  });
  refresh();
}
