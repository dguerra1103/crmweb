import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/format";

export type BrandSettings = {
  name: string;
  tagline: string;
  primaryColor: string;
  accentColor: string;
  currency: string;
  countryCode: string;
};

export type AiSettings = {
  provider: "anthropic" | "openai";
  model: string;
  temperature: number;
  systemPrompt: string;
  autoReply: boolean;
  maxHistory: number;
  handoffKeywords: string;
  signature: string;
};

export type WooSettings = {
  enabled: boolean;
  url: string;
  consumerKey: string;
  consumerSecret: string;
};

export type ChannelSettings = {
  provider: "baileys" | "mock" | "cloud";
  workerUrl: string;
  phoneNumberId: string;
  accessToken: string;
};

export type BusinessSettings = {
  awayMessage: string;
  welcomeMessage: string;
  workStart: string;
  workEnd: string;
  noReplyMinutes: number;
};

export type SyncSettings = {
  historyStatus: "idle" | "running" | "complete";
  historyProgress: number;
  importedMessages: number;
  importedChats: number;
  lastHistoryAt: string | null;
  labelsSynced: number;
  lastLabelAt: string | null;
};

export type Settings = {
  brand: BrandSettings;
  ai: AiSettings;
  woo: WooSettings;
  channel: ChannelSettings;
  business: BusinessSettings;
  sync: SyncSettings;
};

export const DEFAULT_SETTINGS: Settings = {
  brand: {
    name: "CRM WhatsApp",
    tagline: "Ventas y atención en un solo lugar",
    primaryColor: "#128C7E",
    accentColor: "#25D366",
    currency: "COP",
    countryCode: "57",
  },
  ai: {
    provider: "anthropic",
    model: "claude-opus-5",
    temperature: 0.4,
    systemPrompt:
      "Eres un asesor comercial del negocio. Respondes por WhatsApp: mensajes cortos, cálidos y directos, en español. Usa SOLO la información de la base de conocimiento; si no sabes algo, dilo y ofrece pasar con un asesor humano. Nunca inventes precios, stock ni plazos de envío. Cierra siempre con una pregunta o un siguiente paso claro.",
    autoReply: false,
    maxHistory: 14,
    handoffKeywords: "asesor, humano, persona, reclamo, queja",
    signature: "",
  },
  woo: { enabled: false, url: "", consumerKey: "", consumerSecret: "" },
  channel: { provider: "mock", workerUrl: "http://localhost:4001", phoneNumberId: "", accessToken: "" },
  business: {
    awayMessage: "¡Gracias por escribirnos! Estamos fuera de horario, te respondemos apenas abramos. 🙌",
    welcomeMessage: "¡Hola! 👋 Gracias por escribir. ¿En qué te podemos ayudar hoy?",
    workStart: "08:00",
    workEnd: "20:00",
    noReplyMinutes: 60,
  },
  sync: {
    historyStatus: "idle",
    historyProgress: 0,
    importedMessages: 0,
    importedChats: 0,
    lastHistoryAt: null,
    labelsSynced: 0,
    lastLabelAt: null,
  },
};

type SectionKey = keyof Settings;

export async function getSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany();
  const result = structuredClone(DEFAULT_SETTINGS);
  for (const row of rows) {
    const key = row.key as SectionKey;
    if (key in result) {
      Object.assign(result[key], parseJson<Record<string, unknown>>(row.value, {}));
    }
  }
  return result;
}

export async function getSection<K extends SectionKey>(key: K): Promise<Settings[K]> {
  const row = await prisma.setting.findUnique({ where: { key } });
  const base = structuredClone(DEFAULT_SETTINGS[key]);
  if (!row) return base;
  return { ...base, ...parseJson<Record<string, unknown>>(row.value, {}) } as Settings[K];
}

export async function saveSection<K extends SectionKey>(key: K, patch: Partial<Settings[K]>) {
  const current = await getSection(key);
  const next = { ...current, ...patch };
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

/** Enmascara secretos para mostrarlos en la UI sin filtrarlos. */
export function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
