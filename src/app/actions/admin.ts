"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole, hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { saveSection, type Settings } from "@/lib/settings";
import { getProviderFor } from "@/lib/channel";
import { syncOrders, syncProducts, testWooConnection } from "@/lib/woo";
import { prepareCampaign, dispatchCampaignBatch } from "@/lib/campaigns";

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

function actionsFromForm(fd: FormData) {
  const types = fd.getAll("actionType").map(String);
  const values = fd.getAll("actionValue").map(String);
  return types
    .map((type, i) => ({ type, value: values[i]?.trim() || undefined }))
    .filter((action) => action.type && action.type !== "none");
}

export type ActionState = { ok?: string; error?: string };

/* ---------------- Usuarios ---------------- */

export async function createUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  const email = required(fd, "email", "El correo").toLowerCase();

  if (await prisma.user.findUnique({ where: { email } })) {
    return { error: "Ya existe un usuario con ese correo." };
  }
  const password = required(fd, "password", "La contraseña");
  if (password.length < 6) return { error: "La contraseña debe tener al menos 6 caracteres." };

  const user = await prisma.user.create({
    data: {
      name: required(fd, "name", "El nombre"),
      email,
      passwordHash: await hashPassword(password),
      role: text(fd, "role") ?? "agent",
    },
  });
  await logActivity({
    userId: admin.id,
    action: "user.created",
    summary: `Creó el usuario ${user.name} (${user.role})`,
  });
  refresh();
  return { ok: `Usuario ${user.name} creado.` };
}

export async function updateUserAction(fd: FormData) {
  await requireRole("admin");
  const id = required(fd, "userId");
  const password = text(fd, "password");
  await prisma.user.update({
    where: { id },
    data: {
      name: required(fd, "name", "El nombre"),
      role: text(fd, "role") ?? "agent",
      active: fd.get("active") === "on",
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    },
  });
  refresh();
}

export async function deleteUserAction(fd: FormData) {
  const admin = await requireRole("admin");
  const id = required(fd, "userId");
  if (id === admin.id) throw new Error("No puedes eliminar tu propio usuario");
  await prisma.user.delete({ where: { id } });
  refresh();
}

/* ---------------- Respuestas rápidas ---------------- */

export async function saveQuickReplyAction(fd: FormData) {
  await requireRole("supervisor");
  const id = text(fd, "quickReplyId");
  const data = {
    shortcut: required(fd, "shortcut", "El atajo").replace(/^\/?/, "/"),
    title: required(fd, "title", "El título"),
    body: required(fd, "body", "El mensaje"),
    category: text(fd, "category") ?? "general",
  };
  if (id) await prisma.quickReply.update({ where: { id }, data });
  else await prisma.quickReply.create({ data });
  refresh();
}

export async function deleteQuickReplyAction(fd: FormData) {
  await requireRole("supervisor");
  await prisma.quickReply.delete({ where: { id: required(fd, "quickReplyId") } });
  refresh();
}

/* ---------------- Chatbot ---------------- */

export async function saveBotRuleAction(fd: FormData) {
  await requireRole("supervisor");
  const id = text(fd, "ruleId");
  const data = {
    name: required(fd, "name", "El nombre"),
    match: text(fd, "match") ?? "contains",
    keywords: text(fd, "keywords") ?? "",
    reply: required(fd, "reply", "La respuesta"),
    priority: Number(text(fd, "priority") ?? 0),
    enabled: fd.get("enabled") === "on",
    actions: JSON.stringify(actionsFromForm(fd)),
  };
  if (id) await prisma.botRule.update({ where: { id }, data });
  else await prisma.botRule.create({ data });
  refresh();
}

export async function toggleBotRuleAction(fd: FormData) {
  await requireRole("supervisor");
  const id = required(fd, "ruleId");
  const rule = await prisma.botRule.findUniqueOrThrow({ where: { id } });
  await prisma.botRule.update({ where: { id }, data: { enabled: !rule.enabled } });
  refresh();
}

export async function deleteBotRuleAction(fd: FormData) {
  await requireRole("supervisor");
  await prisma.botRule.delete({ where: { id: required(fd, "ruleId") } });
  refresh();
}

/* ---------------- Automatizaciones ---------------- */

export async function saveAutomationAction(fd: FormData) {
  await requireRole("supervisor");
  const id = text(fd, "automationId");
  const data = {
    name: required(fd, "name", "El nombre"),
    trigger: required(fd, "trigger", "El disparador"),
    enabled: fd.get("enabled") === "on",
    conditions: JSON.stringify({
      keywords: text(fd, "keywords") ?? undefined,
      stageId: text(fd, "conditionStageId") ?? undefined,
      tagId: text(fd, "conditionTagId") ?? undefined,
      onlyUnassigned: fd.get("onlyUnassigned") === "on" ? true : undefined,
    }),
    actions: JSON.stringify(actionsFromForm(fd)),
  };
  if (id) await prisma.automation.update({ where: { id }, data });
  else await prisma.automation.create({ data });
  refresh();
}

export async function toggleAutomationAction(fd: FormData) {
  await requireRole("supervisor");
  const id = required(fd, "automationId");
  const automation = await prisma.automation.findUniqueOrThrow({ where: { id } });
  await prisma.automation.update({ where: { id }, data: { enabled: !automation.enabled } });
  refresh();
}

export async function deleteAutomationAction(fd: FormData) {
  await requireRole("supervisor");
  await prisma.automation.delete({ where: { id: required(fd, "automationId") } });
  refresh();
}

/* ---------------- Base de conocimiento ---------------- */

export async function saveKnowledgeAction(fd: FormData) {
  await requireRole("supervisor");
  const id = text(fd, "knowledgeId");
  const data = {
    kind: text(fd, "kind") ?? "faq",
    title: required(fd, "title", "El título"),
    content: required(fd, "content", "El contenido"),
    keywords: text(fd, "keywords"),
    active: fd.get("active") === "on",
  };
  if (id) await prisma.knowledge.update({ where: { id }, data });
  else await prisma.knowledge.create({ data });
  refresh();
}

export async function deleteKnowledgeAction(fd: FormData) {
  await requireRole("supervisor");
  await prisma.knowledge.delete({ where: { id: required(fd, "knowledgeId") } });
  refresh();
}

/* ---------------- Campañas ---------------- */

export async function saveCampaignAction(fd: FormData) {
  await requireRole("supervisor");
  const id = text(fd, "campaignId");
  const scheduledAt = text(fd, "scheduledAt");
  const data = {
    name: required(fd, "name", "El nombre"),
    body: required(fd, "body", "El mensaje"),
    mediaUrl: text(fd, "mediaUrl"),
    channelId: text(fd, "channelId"),
    throttleSec: Number(text(fd, "throttleSec") ?? 12),
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    segment: JSON.stringify({
      stageIds: fd.getAll("stageIds").map(String).filter(Boolean),
      tagIds: fd.getAll("tagIds").map(String).filter(Boolean),
      hasOrders: fd.get("hasOrders") === "on" ? true : undefined,
      inactiveDays: text(fd, "inactiveDays") ? Number(text(fd, "inactiveDays")) : undefined,
    }),
  };

  const campaign = id
    ? await prisma.campaign.update({ where: { id }, data })
    : await prisma.campaign.create({ data });

  await prepareCampaign(campaign.id);
  refresh();
}

export async function startCampaignAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("supervisor");
  const id = required(fd, "campaignId");

  const total = await prepareCampaign(id);
  if (total === 0) return { error: "El segmento no tiene contactos." };

  await prisma.campaign.update({
    where: { id },
    data: { status: "running", startedAt: new Date(), sentCount: 0, failedCount: 0, finishedAt: null },
  });
  const batch = await dispatchCampaignBatch(id);

  await logActivity({
    userId: user.id,
    action: "campaign.started",
    summary: `Inició una campaña para ${total} contactos`,
    entityType: "campaign",
    entityId: id,
  });
  refresh();
  return {
    ok: `Campaña iniciada: ${batch.sent} enviados, ${batch.remaining} en cola. El resto sale por lotes desde /api/cron.`,
  };
}

export async function pauseCampaignAction(fd: FormData) {
  await requireRole("supervisor");
  await prisma.campaign.update({ where: { id: required(fd, "campaignId") }, data: { status: "draft" } });
  refresh();
}

export async function deleteCampaignAction(fd: FormData) {
  await requireRole("supervisor");
  await prisma.campaign.delete({ where: { id: required(fd, "campaignId") } });
  refresh();
}

/* ---------------- Ajustes ---------------- */

export async function saveBrandAction(fd: FormData) {
  await requireRole("admin");
  await saveSection("brand", {
    name: required(fd, "name", "El nombre"),
    tagline: text(fd, "tagline") ?? "",
    primaryColor: text(fd, "primaryColor") ?? "#128C7E",
    accentColor: text(fd, "accentColor") ?? "#25D366",
    currency: text(fd, "currency") ?? "COP",
    countryCode: (text(fd, "countryCode") ?? "57").replace(/\D/g, ""),
  });
  refresh();
}

export async function saveAiSettingsAction(fd: FormData) {
  await requireRole("admin");
  await saveSection("ai", {
    provider: (text(fd, "provider") ?? "anthropic") as Settings["ai"]["provider"],
    model: text(fd, "model") ?? "claude-opus-5",
    temperature: Number(text(fd, "temperature") ?? 0.4),
    systemPrompt: text(fd, "systemPrompt") ?? "",
    autoReply: fd.get("autoReply") === "on",
    maxHistory: Number(text(fd, "maxHistory") ?? 14),
    handoffKeywords: text(fd, "handoffKeywords") ?? "",
    signature: text(fd, "signature") ?? "",
  });
  refresh();
}

export async function saveBusinessAction(fd: FormData) {
  await requireRole("admin");
  await saveSection("business", {
    welcomeMessage: text(fd, "welcomeMessage") ?? "",
    awayMessage: text(fd, "awayMessage") ?? "",
    workStart: text(fd, "workStart") ?? "08:00",
    workEnd: text(fd, "workEnd") ?? "20:00",
    noReplyMinutes: Number(text(fd, "noReplyMinutes") ?? 60),
  });
  refresh();
}

/* ---------------- Líneas de WhatsApp ---------------- */

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30) || `linea-${Date.now().toString(36)}`
  );
}

export async function createChannelAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  const name = required(fd, "name", "El nombre");

  let sessionId = slugify(name);
  if (await prisma.channel.findUnique({ where: { sessionId } })) {
    sessionId = `${sessionId}-${Date.now().toString(36).slice(-4)}`;
  }

  const count = await prisma.channel.count();
  const channel = await prisma.channel.create({
    data: {
      name,
      sessionId,
      provider: text(fd, "provider") ?? "baileys",
      workerUrl: text(fd, "workerUrl") ?? "http://localhost:4001",
      phoneNumberId: text(fd, "phoneNumberId"),
      accessToken: text(fd, "accessToken"),
      color: text(fd, "color") ?? "#0f766e",
      order: count,
    },
  });

  await logActivity({
    userId: admin.id,
    action: "channel.created",
    summary: `Agregó la línea "${channel.name}"`,
    entityType: "channel",
    entityId: channel.id,
  });
  refresh();
  return { ok: `Línea "${channel.name}" creada. Pulsa Conectar para escanear el QR.` };
}

export async function updateChannelAction(fd: FormData) {
  await requireRole("admin");
  const id = required(fd, "channelId");
  const accessToken = text(fd, "accessToken");

  await prisma.channel.update({
    where: { id },
    data: {
      name: required(fd, "name", "El nombre"),
      provider: text(fd, "provider") ?? "baileys",
      workerUrl: text(fd, "workerUrl") ?? "http://localhost:4001",
      phoneNumberId: text(fd, "phoneNumberId"),
      color: text(fd, "color") ?? "#0f766e",
      active: fd.get("active") === "on",
      ...(accessToken && !accessToken.includes("••") ? { accessToken } : {}),
    },
  });
  refresh();
}

export async function deleteChannelAction(fd: FormData) {
  await requireRole("admin");
  const id = required(fd, "channelId");
  const remaining = await prisma.channel.count();
  if (remaining <= 1) throw new Error("Debe quedar al menos una línea de WhatsApp");
  await prisma.channel.delete({ where: { id } });
  refresh();
}

export async function connectChannelAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireRole("admin");
  const channel = await prisma.channel.findUniqueOrThrow({ where: { id: required(fd, "channelId") } });
  const result = await getProviderFor(channel).connect();
  refresh();
  return result.ok ? { ok: result.detail ?? "Listo." } : { error: result.detail ?? "No se pudo conectar." };
}

export async function logoutChannelAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireRole("admin");
  const channel = await prisma.channel.findUniqueOrThrow({ where: { id: required(fd, "channelId") } });
  const result = await getProviderFor(channel).logout();
  await prisma.channel.update({ where: { id: channel.id }, data: { phone: null } });
  refresh();
  return result.ok ? { ok: result.detail ?? "Sesión cerrada." } : { error: result.detail ?? "No se pudo cerrar." };
}

/* ---------------- WooCommerce ---------------- */

export async function saveWooAction(fd: FormData) {
  await requireRole("admin");
  const patch: Partial<Settings["woo"]> = {
    enabled: fd.get("enabled") === "on",
    url: text(fd, "url") ?? "",
  };
  const key = text(fd, "consumerKey");
  const secret = text(fd, "consumerSecret");
  if (key && !key.includes("••")) patch.consumerKey = key;
  if (secret && !secret.includes("••")) patch.consumerSecret = secret;

  await saveSection("woo", patch);
  refresh();
}

export async function testWooAction(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  await requireRole("admin");
  const result = await testWooConnection();
  return result.ok ? { ok: "Conexión correcta con WooCommerce." } : { error: result.error ?? "Falló la conexión." };
}

export async function syncWooAction(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  await requireRole("supervisor");
  const products = await syncProducts();
  if (!products.ok) return { error: products.error };
  const orders = await syncOrders();
  if (!orders.ok) return { error: orders.error };

  refresh();
  return {
    ok: `Sincronizado: ${products.data?.synced ?? 0} productos y ${orders.data?.synced ?? 0} pedidos (${orders.data?.linked ?? 0} vinculados a clientes).`,
  };
}
