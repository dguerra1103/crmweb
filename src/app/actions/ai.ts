"use server";

import { requireRole } from "@/lib/auth";
import { buildKnowledgeContext, runAi } from "@/lib/ai";
import { getSection } from "@/lib/settings";

export type AiTestState = { answer?: string; error?: string };

/** Probador del asistente: usa la misma base de conocimiento que las respuestas reales. */
export async function testAiAction(_prev: AiTestState, fd: FormData): Promise<AiTestState> {
  await requireRole("supervisor");
  const question = String(fd.get("question") ?? "").trim();
  if (!question) return { error: "Escribe una pregunta de prueba." };

  const [ai, brand] = await Promise.all([getSection("ai"), getSection("brand")]);
  const knowledge = await buildKnowledgeContext(question);

  const system = [
    ai.systemPrompt,
    `\n## Negocio\n${brand.name}. ${brand.tagline}.`,
    knowledge ? `\n## Base de conocimiento\n${knowledge}` : "\n(No hay base de conocimiento cargada.)",
    "\n## Reglas de salida\n- Máximo 2 párrafos cortos, tono WhatsApp.\n- No uses markdown.",
  ].join("\n");

  const result = await runAi(system, [{ role: "user", content: question }]);
  return result.ok && result.text ? { answer: result.text } : { error: result.error ?? "La IA no respondió." };
}
