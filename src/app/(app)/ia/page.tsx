import { prisma } from "@/lib/db";
import { requireRole, can } from "@/lib/auth";
import { getSection } from "@/lib/settings";
import { PageShell } from "@/components/page-shell";
import { Badge, Button, Card, CardTitle, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { ConfirmButton } from "@/components/auto-submit";
import { AiTester } from "./ai-tester";
import { KNOWLEDGE_KINDS } from "@/lib/constants";
import { AI_MODELS } from "@/lib/ai";
import { deleteKnowledgeAction, saveAiSettingsAction, saveKnowledgeAction } from "@/app/actions/admin";

export const dynamic = "force-dynamic";

export default async function AiPage() {
  const user = await requireRole("supervisor");
  const [ai, knowledge, conversationsWithAi] = await Promise.all([
    getSection("ai"),
    prisma.knowledge.findMany({ orderBy: [{ kind: "asc" }, { updatedAt: "desc" }] }),
    prisma.conversation.count({ where: { aiEnabled: true } }),
  ]);

  const keyReady = ai.provider === "anthropic" ? Boolean(process.env.ANTHROPIC_API_KEY) : Boolean(process.env.OPENAI_API_KEY);
  const models = AI_MODELS[ai.provider];

  return (
    <PageShell wide>
      <PageHeader
        title="Asistente IA"
        subtitle="La IA responde con la información que cargues aquí. Se activa por conversación desde el chat."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={keyReady ? "bg-brand/10 text-brand" : "bg-rose-50 text-rose-600"}>
              {keyReady ? "Clave configurada" : `Falta ${ai.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"} en .env`}
            </Badge>
            <Badge tone="bg-slate-100 text-slate-600">{conversationsWithAi} chats con IA activa</Badge>
          </div>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          <Card>
            <CardTitle aside={<span className="text-xs text-slate-400">{knowledge.length} fichas</span>}>
              Base de conocimiento
            </CardTitle>
            <ul className="divide-y divide-slate-50">
              {knowledge.map((item) => (
                <li key={item.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium text-ink">
                        <Badge tone="bg-slate-100 text-slate-600">
                          {KNOWLEDGE_KINDS.find((k) => k.value === item.kind)?.label ?? item.kind}
                        </Badge>
                        {item.title}
                        {!item.active ? <span className="text-xs text-slate-400">(inactiva)</span> : null}
                      </p>
                      <p className="mt-1 line-clamp-3 text-xs text-slate-600">{item.content}</p>
                      {item.keywords ? (
                        <p className="mt-1 font-mono text-[10px] text-slate-400">{item.keywords}</p>
                      ) : null}
                    </div>
                    <form action={deleteKnowledgeAction}>
                      <input type="hidden" name="knowledgeId" value={item.id} />
                      <ConfirmButton
                        message={`¿Eliminar "${item.title}" de la base de conocimiento?`}
                        className="shrink-0 text-[11px] text-slate-400 hover:text-rose-500"
                      >
                        Eliminar
                      </ConfirmButton>
                    </form>
                  </div>
                </li>
              ))}
              {knowledge.length === 0 ? (
                <li className="px-5 py-6 text-sm text-slate-400">
                  Carga productos, precios, políticas y preguntas frecuentes para que la IA responda con datos reales.
                </li>
              ) : null}
            </ul>

            <form action={saveKnowledgeAction} className="space-y-3 border-t border-slate-100 bg-slate-50/50 p-5">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Nueva ficha</p>
              <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                <Field label="Tipo">
                  <Select name="kind" defaultValue="faq">
                    {KNOWLEDGE_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Título">
                  <Input name="title" required placeholder="Política de garantía" />
                </Field>
              </div>
              <Field label="Contenido" hint="Escríbelo como se lo explicarías a un empleado nuevo.">
                <Textarea name="content" rows={4} required />
              </Field>
              <Field label="Palabras clave" hint="Ayudan a encontrar esta ficha. Separadas por coma.">
                <Input name="keywords" placeholder="garantía, cambio, devolución" />
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="active" defaultChecked className="h-4 w-4 accent-[#0f766e]" />
                Usar esta ficha en las respuestas
              </label>
              <Button type="submit">Guardar ficha</Button>
            </form>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardTitle>Probar el asistente</CardTitle>
            <AiTester />
          </Card>

          {can(user, "admin") ? (
            <Card>
              <CardTitle>Configuración</CardTitle>
              <form action={saveAiSettingsAction} className="space-y-3 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Proveedor">
                    <Select name="provider" defaultValue={ai.provider}>
                      <option value="anthropic">Claude (Anthropic)</option>
                      <option value="openai">OpenAI</option>
                    </Select>
                  </Field>
                  <Field label="Modelo">
                    <Select name="model" defaultValue={ai.model}>
                      {models.map((model) => (
                        <option key={model.value} value={model.value}>
                          {model.label}
                        </option>
                      ))}
                      {!models.some((m) => m.value === ai.model) ? (
                        <option value={ai.model}>{ai.model}</option>
                      ) : null}
                    </Select>
                  </Field>
                </div>

                <Field label="Instrucciones del asistente" hint="Define el tono y los límites de la IA.">
                  <Textarea name="systemPrompt" rows={6} defaultValue={ai.systemPrompt} />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Mensajes de historial" hint="Cuánto contexto lee de cada chat">
                    <Input type="number" name="maxHistory" defaultValue={ai.maxHistory} min={4} max={40} />
                  </Field>
                  <Field label="Creatividad" hint="Solo aplica a modelos que la aceptan">
                    <Input
                      type="number"
                      name="temperature"
                      step="0.1"
                      min="0"
                      max="1"
                      defaultValue={ai.temperature}
                    />
                  </Field>
                </div>

                <Field label="Pasar a humano si el cliente escribe" hint="Separado por coma">
                  <Input name="handoffKeywords" defaultValue={ai.handoffKeywords} />
                </Field>
                <Field label="Firma opcional">
                  <Input name="signature" defaultValue={ai.signature} placeholder="— Equipo de ventas" />
                </Field>

                <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  <input type="checkbox" name="autoReply" defaultChecked={ai.autoReply} className="mt-0.5 h-4 w-4 accent-[#0f766e]" />
                  <span>
                    Responder automáticamente
                    <span className="block text-xs text-amber-700">
                      Si lo activas, la IA contesta sola en los chats donde esté encendida. Si no, solo sugiere
                      respuestas al agente.
                    </span>
                  </span>
                </label>

                <Button type="submit">Guardar configuración</Button>
              </form>
            </Card>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
