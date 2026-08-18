import { prisma } from "@/lib/db";
import { getSection } from "@/lib/settings";
import { money } from "@/lib/format";

export type AiTurn = { role: "user" | "assistant"; content: string };

export type AiResult = { ok: boolean; text?: string; error?: string; handoff?: boolean };

/**
 * Modelos Claude de generación actual: no aceptan `temperature` (error 400)
 * y sí aceptan `output_config.effort`.
 */
const MODERN_CLAUDE = /^claude-(opus-5|sonnet-5|fable-5|mythos-5|opus-4-[678]|sonnet-4-6)/;

export const AI_MODELS = {
  anthropic: [
    { value: "claude-opus-5", label: "Claude Opus 5 (máxima calidad)" },
    { value: "claude-sonnet-5", label: "Claude Sonnet 5 (equilibrado)" },
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 (más barato y rápido)" },
  ],
  openai: [
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    { value: "gpt-4o", label: "GPT-4o" },
  ],
} as const;

/** Selecciona los fragmentos de la base de conocimiento más relevantes para el hilo. */
export async function buildKnowledgeContext(query: string, limit = 14) {
  const items = await prisma.knowledge.findMany({ where: { active: true }, orderBy: { updatedAt: "desc" } });
  if (items.length === 0) return "";

  const words = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const scored = items.map((item) => {
    const haystack = `${item.title} ${item.keywords ?? ""} ${item.content}`.toLowerCase();
    const score = words.reduce((acc, word) => (haystack.includes(word) ? acc + 1 : acc), 0);
    return { item, score };
  });

  const relevant = scored.some((s) => s.score > 0)
    ? scored.sort((a, b) => b.score - a.score).slice(0, limit)
    : scored.slice(0, limit);

  return relevant.map(({ item }) => `### [${item.kind}] ${item.title}\n${item.content}`).join("\n\n");
}

/** Productos de WooCommerce que coinciden con el texto del cliente. */
export async function buildCatalogContext(query: string, limit = 6) {
  const words = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  if (words.length === 0) return "";

  const products = await prisma.product.findMany({
    where: { OR: words.map((w) => ({ name: { contains: w } })) },
    take: limit,
  });
  if (products.length === 0) return "";

  return products
    .map(
      (p) =>
        `- ${p.name} — ${money(p.price)} — ${
          p.stockStatus === "instock" ? `disponible${p.stock != null ? ` (${p.stock} und)` : ""}` : "agotado"
        }${p.permalink ? ` — ${p.permalink}` : ""}`,
    )
    .join("\n");
}

type AnthropicResponse = {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
  stop_details?: { category?: string | null } | null;
  error?: { message: string };
};

async function callAnthropic(
  model: string,
  system: string,
  turns: AiTurn[],
  temperature: number,
): Promise<AiResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "Falta ANTHROPIC_API_KEY en el archivo .env" };

  const modern = MODERN_CLAUDE.test(model);

  const body: Record<string, unknown> = {
    model,
    // El límite cubre razonamiento + respuesta: dejamos margen para que no se corte.
    max_tokens: 2000,
    system,
    messages: turns.map((t) => ({ role: t.role, content: t.content })),
  };

  if (modern) {
    // `temperature` fue eliminado en estos modelos (devuelve 400).
    // Respuestas de WhatsApp: esfuerzo bajo para latencia y costo.
    body.output_config = { effort: "low" };
  } else {
    body.temperature = temperature;
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as AnthropicResponse;
    if (!res.ok) return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };

    // Los clasificadores pueden rechazar la petición con HTTP 200.
    if (data.stop_reason === "refusal") {
      return {
        ok: false,
        error: `La IA declinó responder este mensaje${
          data.stop_details?.category ? ` (${data.stop_details.category})` : ""
        }. Responde manualmente.`,
      };
    }

    const text = (data.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n")
      .trim();
    return text ? { ok: true, text } : { ok: false, error: "La IA no devolvió texto." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "error de red" };
  }
}

async function callOpenAI(model: string, system: string, turns: AiTurn[], temperature: number): Promise<AiResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "Falta OPENAI_API_KEY en el archivo .env" };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: 900,
        messages: [{ role: "system", content: system }, ...turns],
      }),
    });
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { message: string };
    };
    if (!res.ok) return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text ? { ok: true, text } : { ok: false, error: "La IA no devolvió texto." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "error de red" };
  }
}

export async function runAi(system: string, turns: AiTurn[]): Promise<AiResult> {
  const ai = await getSection("ai");
  return ai.provider === "openai"
    ? callOpenAI(ai.model, system, turns, ai.temperature)
    : callAnthropic(ai.model, system, turns, ai.temperature);
}

/** Arma el prompt completo (negocio + conocimiento + catálogo + ficha del cliente) y responde. */
export async function generateConversationReply(conversationId: string): Promise<AiResult> {
  const [ai, brand] = await Promise.all([getSection("ai"), getSection("brand")]);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      contact: {
        include: {
          stage: true,
          tags: { include: { tag: true } },
          orders: { take: 5, orderBy: { wooCreatedAt: "desc" } },
        },
      },
      messages: { orderBy: { createdAt: "desc" }, take: ai.maxHistory },
    },
  });
  if (!conversation) return { ok: false, error: "Conversación no encontrada." };

  const history = [...conversation.messages].reverse();
  const lastCustomerText = [...history].reverse().find((m) => m.direction === "in")?.body ?? "";

  const handoffWords = ai.handoffKeywords
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
  const handoff = handoffWords.some((w) => lastCustomerText.toLowerCase().includes(w));

  const [knowledge, catalog] = await Promise.all([
    buildKnowledgeContext(lastCustomerText || conversation.lastMessage || ""),
    buildCatalogContext(lastCustomerText || ""),
  ]);

  const contact = conversation.contact;
  const contactCard = [
    `Nombre: ${contact.name}`,
    `Teléfono: ${contact.phone}`,
    contact.stage ? `Etapa del embudo: ${contact.stage.name}` : null,
    contact.tags.length ? `Etiquetas: ${contact.tags.map((t) => t.tag.name).join(", ")}` : null,
    contact.ordersCount
      ? `Compras: ${contact.ordersCount} por ${money(contact.totalSpent, brand.currency)}`
      : "Sin compras registradas",
    contact.orders.length
      ? `Últimos pedidos: ${contact.orders
          .map((o) => `#${o.number} (${o.status}, ${money(o.total, o.currency)})`)
          .join("; ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const system = [
    ai.systemPrompt,
    `\n## Negocio\nNombre: ${brand.name}. ${brand.tagline}. Moneda: ${brand.currency}.`,
    `\n## Cliente\n${contactCard}`,
    knowledge ? `\n## Base de conocimiento\n${knowledge}` : "",
    catalog ? `\n## Productos relacionados (catálogo real)\n${catalog}` : "",
    `\n## Reglas de salida\n- Máximo 2 párrafos cortos, tono WhatsApp.\n- No uses markdown ni asteriscos de formato.\n- No incluyas etiquetas XML internas en tu respuesta.\n- Si el cliente pide hablar con una persona, dile que ya avisas a un asesor y no prometas nada más.`,
    ai.signature ? `\n- Firma al final con: ${ai.signature}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const turns: AiTurn[] = history
    .filter((m) => m.type === "text" && m.body.trim().length > 0)
    .map((m) => ({ role: m.direction === "in" ? ("user" as const) : ("assistant" as const), content: m.body }));

  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    turns.push({ role: "user", content: lastCustomerText || "Hola" });
  }

  const result = await runAi(system, turns);
  return { ...result, handoff };
}

/** Resumen corto del hilo para el panel lateral. */
export async function summarizeConversation(conversationId: string): Promise<AiResult> {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  if (messages.length === 0) return { ok: false, error: "No hay mensajes para resumir." };

  const transcript = [...messages]
    .reverse()
    .map((m) => `${m.direction === "in" ? "Cliente" : "Negocio"}: ${m.body}`)
    .join("\n");

  return runAi(
    "Resumes conversaciones de ventas por WhatsApp para un CRM. Responde en español con: 1) qué quiere el cliente, 2) en qué quedó la conversación, 3) el siguiente paso sugerido. Máximo 4 líneas, sin markdown.",
    [{ role: "user", content: transcript }],
  );
}
