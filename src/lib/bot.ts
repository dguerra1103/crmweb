import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/format";

export type BotAction = { type: string; value?: string };

export type BotMatch = { ruleId: string; reply: string; actions: BotAction[] };

function keywordList(raw: string) {
  return raw
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

/** Busca la primera regla del chatbot que coincide con el mensaje del cliente. */
export async function matchBotRule(text: string, isFirstMessage: boolean): Promise<BotMatch | null> {
  const rules = await prisma.botRule.findMany({
    where: { enabled: true },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  if (rules.length === 0) return null;

  const body = (text || "").trim().toLowerCase();

  const hit = rules.find((rule) => {
    const keys = keywordList(rule.keywords);
    switch (rule.match) {
      case "welcome":
        return isFirstMessage;
      case "equals":
        return keys.includes(body);
      case "starts":
        return keys.some((k) => body.startsWith(k));
      case "regex":
        try {
          return new RegExp(rule.keywords, "i").test(text);
        } catch {
          return false;
        }
      case "fallback":
        return false;
      case "contains":
      default:
        return keys.some((k) => body.includes(k));
    }
  });

  const rule = hit ?? rules.find((r) => r.match === "fallback");
  if (!rule || !rule.reply.trim()) return null;

  return {
    ruleId: rule.id,
    reply: rule.reply,
    actions: parseJson<BotAction[]>(rule.actions, []),
  };
}
