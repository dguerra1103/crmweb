import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { PageShell } from "@/components/page-shell";
import { Button, Card, CardTitle, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { ConfirmButton } from "@/components/auto-submit";
import { AUTOMATION_ACTIONS, AUTOMATION_TRIGGERS, BOT_MATCHES } from "@/lib/constants";
import { parseJson, relativeTime } from "@/lib/format";
import {
  deleteAutomationAction,
  deleteBotRuleAction,
  deleteQuickReplyAction,
  saveAutomationAction,
  saveBotRuleAction,
  saveQuickReplyAction,
  toggleAutomationAction,
  toggleBotRuleAction,
} from "@/app/actions/admin";

export const dynamic = "force-dynamic";

type Action = { type: string; value?: string };

function ActionRows({
  actions,
  stages,
  tags,
  agents,
}: {
  actions: Action[];
  stages: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  agents: { id: string; name: string }[];
}) {
  const rows = [actions[0] ?? { type: "" }, actions[1] ?? { type: "" }, actions[2] ?? { type: "" }];

  return (
    <div className="space-y-2">
      {rows.map((action, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-[200px_1fr]">
          <Select name="actionType" defaultValue={action.type || "none"}>
            <option value="none">— Sin acción —</option>
            {AUTOMATION_ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
          <Input
            name="actionValue"
            defaultValue={action.value ?? ""}
            placeholder="Mensaje, o id de etiqueta/etapa/agente (ver listas abajo)"
          />
        </div>
      ))}
      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer">Ver identificadores disponibles</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="font-semibold text-slate-600">Etapas</p>
            {stages.map((s) => (
              <p key={s.id} className="font-mono text-[10px]">
                {s.name}: {s.id}
              </p>
            ))}
          </div>
          <div>
            <p className="font-semibold text-slate-600">Etiquetas</p>
            {tags.map((t) => (
              <p key={t.id} className="font-mono text-[10px]">
                {t.name}: {t.id}
              </p>
            ))}
          </div>
          <div>
            <p className="font-semibold text-slate-600">Agentes</p>
            {agents.map((a) => (
              <p key={a.id} className="font-mono text-[10px]">
                {a.name}: {a.id}
              </p>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}

export default async function AutomationsPage() {
  await requireRole("supervisor");

  const [rules, automations, quickReplies, stages, tags, agents] = await Promise.all([
    prisma.botRule.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "asc" }] }),
    prisma.automation.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.quickReply.findMany({ orderBy: { shortcut: "asc" } }),
    prisma.stage.findMany({ orderBy: { order: "asc" } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <PageShell wide>
      <PageHeader
        title="Automatizaciones"
        subtitle="Chatbot por reglas, acciones automáticas y respuestas rápidas del equipo"
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <Card>
            <CardTitle aside={<span className="text-xs text-slate-400">{rules.length} reglas</span>}>
              Chatbot por reglas
            </CardTitle>
            <ul className="divide-y divide-slate-50">
              {rules.map((rule) => (
                <li key={rule.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{rule.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {BOT_MATCHES.find((m) => m.value === rule.match)?.label}
                        {rule.keywords ? `: ${rule.keywords}` : ""}
                      </p>
                      <p className="mt-1 line-clamp-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                        {rule.reply}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <form action={toggleBotRuleAction}>
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <button
                          type="submit"
                          className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                            rule.enabled ? "bg-brand/10 text-brand" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {rule.enabled ? "Activa" : "Pausada"}
                        </button>
                      </form>
                      <form action={deleteBotRuleAction}>
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <ConfirmButton
                          message={`¿Eliminar la regla "${rule.name}"?`}
                          className="text-[11px] text-slate-400 hover:text-rose-500"
                        >
                          Eliminar
                        </ConfirmButton>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
              {rules.length === 0 ? <li className="px-5 py-6 text-sm text-slate-400">Sin reglas aún.</li> : null}
            </ul>

            <form action={saveBotRuleAction} className="space-y-3 border-t border-slate-100 bg-slate-50/50 p-5">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Nueva regla</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nombre">
                  <Input name="name" required placeholder="Consulta de envíos" />
                </Field>
                <Field label="Coincidencia">
                  <Select name="match" defaultValue="contains">
                    {BOT_MATCHES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Palabras clave" hint="Separadas por coma. Vacío para bienvenida o fallback.">
                <Input name="keywords" placeholder="envío, domicilio, cuánto demora" />
              </Field>
              <Field label="Respuesta automática">
                <Textarea name="reply" rows={3} required placeholder="Los envíos llegan en 1 a 3 días hábiles 📦" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Prioridad" hint="Mayor número = se evalúa primero">
                  <Input type="number" name="priority" defaultValue={10} />
                </Field>
                <label className="flex items-end gap-2 pb-2 text-sm text-slate-600">
                  <input type="checkbox" name="enabled" defaultChecked className="h-4 w-4 accent-[#0f766e]" />
                  Activar al guardar
                </label>
              </div>
              <Button type="submit">Guardar regla</Button>
            </form>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardTitle aside={<span className="text-xs text-slate-400">{automations.length} activas</span>}>
              Automatizaciones
            </CardTitle>
            <ul className="divide-y divide-slate-50">
              {automations.map((automation) => {
                const actions = parseJson<Action[]>(automation.actions, []);
                return (
                  <li key={automation.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{automation.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {AUTOMATION_TRIGGERS.find((t) => t.value === automation.trigger)?.label ??
                            automation.trigger}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {actions
                            .map((a) => AUTOMATION_ACTIONS.find((x) => x.value === a.type)?.label ?? a.type)
                            .join(" → ") || "Sin acciones"}
                        </p>
                        <p className="mt-1 font-mono text-[10px] text-slate-300">
                          {automation.runCount} ejecuciones
                          {automation.lastRunAt ? ` · última ${relativeTime(automation.lastRunAt)}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <form action={toggleAutomationAction}>
                          <input type="hidden" name="automationId" value={automation.id} />
                          <button
                            type="submit"
                            className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                              automation.enabled ? "bg-brand/10 text-brand" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {automation.enabled ? "Activa" : "Pausada"}
                          </button>
                        </form>
                        <form action={deleteAutomationAction}>
                          <input type="hidden" name="automationId" value={automation.id} />
                          <ConfirmButton
                            message={`¿Eliminar la automatización "${automation.name}"?`}
                            className="text-[11px] text-slate-400 hover:text-rose-500"
                          >
                            Eliminar
                          </ConfirmButton>
                        </form>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <form action={saveAutomationAction} className="space-y-3 border-t border-slate-100 bg-slate-50/50 p-5">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Nueva automatización</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nombre">
                  <Input name="name" required placeholder="Recuperar carritos fríos" />
                </Field>
                <Field label="Cuándo se dispara">
                  <Select name="trigger" defaultValue="message_received">
                    {AUTOMATION_TRIGGERS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Solo si el mensaje contiene" hint="Opcional, separado por coma">
                <Input name="keywords" placeholder="precio, cotización" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Solo en la etapa">
                  <Select name="conditionStageId" defaultValue="">
                    <option value="">Cualquiera</option>
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Solo con la etiqueta">
                  <Select name="conditionTagId" defaultValue="">
                    <option value="">Cualquiera</option>
                    {tags.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="onlyUnassigned" className="h-4 w-4 accent-[#0f766e]" />
                Solo si el chat no tiene agente asignado
              </label>

              <p className="pt-2 text-xs font-semibold text-slate-600">Acciones</p>
              <ActionRows actions={[]} stages={stages} tags={tags} agents={agents} />

              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="enabled" defaultChecked className="h-4 w-4 accent-[#0f766e]" />
                Activar al guardar
              </label>
              <Button type="submit">Guardar automatización</Button>
            </form>
          </Card>

          <Card>
            <CardTitle aside={<span className="text-xs text-slate-400">{quickReplies.length} plantillas</span>}>
              Respuestas rápidas
            </CardTitle>
            <ul className="divide-y divide-slate-50">
              {quickReplies.map((reply) => (
                <li key={reply.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-mono text-brand">{reply.shortcut}</span>{" "}
                      <span className="font-medium text-ink">{reply.title}</span>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{reply.body}</p>
                  </div>
                  <form action={deleteQuickReplyAction}>
                    <input type="hidden" name="quickReplyId" value={reply.id} />
                    <ConfirmButton
                      message={`¿Eliminar la respuesta ${reply.shortcut}?`}
                      className="text-[11px] text-slate-400 hover:text-rose-500"
                    >
                      Eliminar
                    </ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>

            <form action={saveQuickReplyAction} className="space-y-3 border-t border-slate-100 bg-slate-50/50 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Atajo">
                  <Input name="shortcut" required placeholder="/garantia" />
                </Field>
                <Field label="Título">
                  <Input name="title" required placeholder="Explicar garantía" />
                </Field>
              </div>
              <Field label="Mensaje">
                <Textarea name="body" rows={2} required placeholder="Todos los productos tienen 30 días…" />
              </Field>
              <Button type="submit">Guardar respuesta</Button>
            </form>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
