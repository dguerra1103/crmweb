import { prisma } from "@/lib/db";
import type { ChannelProvider, ChannelStatus, OutboundMessage, SendResult } from "./types";

export type ChannelRecord = {
  id: string;
  name: string;
  sessionId: string;
  provider: string;
  workerUrl: string;
  phoneNumberId: string | null;
  accessToken: string | null;
};

const WORKER_SECRET = process.env.WA_WORKER_SECRET || "dev-worker-secret";

/** Proveedor de pruebas: no envía nada real, marca todo como enviado. */
function mockProvider(channel: ChannelRecord): ChannelProvider {
  return {
    name: "mock",
    label: "Simulador (sin WhatsApp real)",
    async send(): Promise<SendResult> {
      return { ok: true, externalId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
    },
    async status(): Promise<ChannelStatus> {
      return {
        provider: "mock",
        label: "Simulador",
        connected: true,
        detail: `"${channel.name}" está en modo de pruebas: los mensajes se guardan en el CRM pero no salen a WhatsApp.`,
      };
    },
    async connect() {
      return { ok: true, detail: "El simulador siempre está conectado." };
    },
    async logout() {
      return { ok: true };
    },
    async postStatus() {
      return { ok: true, recipients: 0 };
    },
    async setChatLabel() {
      return { ok: false, error: "El simulador no maneja etiquetas de WhatsApp." };
    },
  };
}

/** WhatsApp por QR: habla con el worker Baileys (una sesión por línea). */
function baileysProvider(channel: ChannelRecord): ChannelProvider {
  const base = channel.workerUrl.replace(/\/$/, "");

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { "content-type": "application/json", "x-worker-secret": WORKER_SECRET, ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`worker ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  const withSession = (payload: Record<string, unknown> = {}) =>
    JSON.stringify({ session: channel.sessionId, ...payload });

  return {
    name: "baileys",
    label: "WhatsApp por QR",
    async send(message: OutboundMessage) {
      try {
        return await call<SendResult>("/send", { method: "POST", body: withSession({ ...message }) });
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "worker no disponible" };
      }
    },
    async status() {
      try {
        const raw = await call<Omit<ChannelStatus, "provider" | "label">>(
          `/status?session=${encodeURIComponent(channel.sessionId)}`,
        );
        return { provider: "baileys", label: "WhatsApp por QR", ...raw };
      } catch (error) {
        return {
          provider: "baileys",
          label: "WhatsApp por QR",
          connected: false,
          detail: `Worker apagado. Ejecuta "npm run wa" en otra terminal. (${
            error instanceof Error ? error.message : "sin detalle"
          })`,
        };
      }
    },
    async connect() {
      try {
        return await call<{ ok: boolean; detail?: string }>("/connect", { method: "POST", body: withSession() });
      } catch (error) {
        return { ok: false, detail: error instanceof Error ? error.message : "worker no disponible" };
      }
    },
    async logout() {
      try {
        return await call<{ ok: boolean; detail?: string }>("/logout", { method: "POST", body: withSession() });
      } catch (error) {
        return { ok: false, detail: error instanceof Error ? error.message : "worker no disponible" };
      }
    },
    async postStatus(input) {
      try {
        return await call<{ ok: boolean; recipients?: number; error?: string }>("/status-post", {
          method: "POST",
          body: withSession({ ...input }),
        });
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "worker no disponible" };
      }
    },
    async setChatLabel(input) {
      try {
        return await call<{ ok: boolean; error?: string }>("/label", {
          method: "POST",
          body: withSession({ ...input }),
        });
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "worker no disponible" };
      }
    },
  };
}

/** WhatsApp Cloud API oficial de Meta. */
function cloudProvider(channel: ChannelRecord): ChannelProvider {
  const phoneNumberId = channel.phoneNumberId ?? "";
  const accessToken = channel.accessToken ?? "";

  return {
    name: "cloud",
    label: "WhatsApp Cloud API (Meta)",
    async send(message: OutboundMessage) {
      if (!phoneNumberId || !accessToken) return { ok: false, error: "Faltan credenciales de Meta Cloud API." };
      const payload = message.mediaUrl
        ? {
            messaging_product: "whatsapp",
            to: message.to,
            type: message.mediaType ?? "image",
            [message.mediaType ?? "image"]: { link: message.mediaUrl, caption: message.text },
          }
        : {
            messaging_product: "whatsapp",
            to: message.to,
            type: "text",
            text: { body: message.text ?? "" },
          };
      try {
        const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as { messages?: { id: string }[]; error?: { message: string } };
        if (!res.ok) return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };
        return { ok: true, externalId: data.messages?.[0]?.id };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "error de red" };
      }
    },
    async status() {
      return {
        provider: "cloud",
        label: "WhatsApp Cloud API (Meta)",
        connected: Boolean(phoneNumberId && accessToken),
        phone: phoneNumberId || null,
        detail: phoneNumberId
          ? "Recuerda apuntar el webhook de Meta a /api/webhooks/whatsapp."
          : "Configura Phone Number ID y token en esta línea.",
      };
    },
    async connect() {
      return { ok: true, detail: "Cloud API no requiere emparejamiento: valida credenciales y webhook." };
    },
    async logout() {
      return { ok: true };
    },
    async postStatus() {
      return { ok: false, error: "Los estados solo existen en la app de WhatsApp (conexión por QR)." };
    },
    async setChatLabel() {
      return { ok: false, error: "Las etiquetas solo existen en la app de WhatsApp Business (conexión por QR)." };
    },
  };
}

export function getProviderFor(channel: ChannelRecord): ChannelProvider {
  if (channel.provider === "baileys") return baileysProvider(channel);
  if (channel.provider === "cloud") return cloudProvider(channel);
  return mockProvider(channel);
}

/** Línea por defecto: la primera activa. */
export async function getDefaultChannel() {
  return prisma.channel.findFirst({ where: { active: true }, orderBy: { order: "asc" } });
}

export async function getChannelBySession(sessionId: string) {
  return prisma.channel.findUnique({ where: { sessionId } });
}

/** Proveedor de la línea por la que va una conversación. */
export async function getProviderForConversation(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { channelLine: true },
  });
  const channel = conversation?.channelLine ?? (await getDefaultChannel());
  if (!channel) return null;
  return { channel, provider: getProviderFor(channel) };
}

export type { ChannelProvider, ChannelStatus, OutboundMessage, SendResult };
