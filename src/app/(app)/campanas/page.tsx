import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { PageShell } from "@/components/page-shell";
import { Badge, Button, Card, CardTitle, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { ConfirmButton } from "@/components/auto-submit";
import { StartCampaignButton } from "./start-button";
import { parseJson, relativeTime } from "@/lib/format";
import { deleteCampaignAction, pauseCampaignAction, saveCampaignAction } from "@/app/actions/admin";

export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  scheduled: "bg-sky-50 text-sky-700",
  running: "bg-brand/10 text-brand",
  done: "bg-emerald-50 text-emerald-700",
  failed: "bg-rose-50 text-rose-600",
};

export default async function CampaignsPage() {
  await requireRole("supervisor");

  const [campaigns, stages, tags, contactsTotal, channels] = await Promise.all([
    prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { recipients: true } } },
    }),
    prisma.stage.findMany({ orderBy: { order: "asc" } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
    prisma.contact.count({ where: { isBlocked: false } }),
    prisma.channel.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
  ]);

  return (
    <PageShell wide>
      <PageHeader
        title="Campañas"
        subtitle={`Mensajes masivos segmentados · ${contactsTotal} contactos disponibles`}
      />

      <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Cuida el número.</strong> Con WhatsApp por QR, los envíos masivos son la principal causa de bloqueo.
        El CRM envía por lotes pequeños y solo avanza cuando se llama a <code className="font-mono">/api/cron</code>.
        Empieza con segmentos pequeños y clientes que ya te escribieron.
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="space-y-4">
          {campaigns.map((campaign) => {
            const segment = parseJson<{ stageIds?: string[]; tagIds?: string[] }>(campaign.segment, {});
            const pending = campaign._count.recipients - campaign.sentCount - campaign.failedCount;
            return (
              <Card key={campaign.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                      {campaign.name}
                      <Badge tone={STATUS_TONES[campaign.status] ?? STATUS_TONES.draft}>{campaign.status}</Badge>
                    </p>
                    <p className="mt-2 line-clamp-3 rounded-xl bg-slate-50 p-3 text-xs whitespace-pre-wrap text-slate-600">
                      {campaign.body}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      Segmento:{" "}
                      {[
                        segment.stageIds?.length
                          ? `${segment.stageIds.length} etapa(s)`
                          : null,
                        segment.tagIds?.length ? `${segment.tagIds.length} etiqueta(s)` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "todos los contactos"}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm text-ink">
                      {campaign.sentCount}/{campaign._count.recipients}
                    </p>
                    <p className="text-[10px] text-slate-400">enviados</p>
                    {campaign.failedCount > 0 ? (
                      <p className="mt-1 text-[10px] text-rose-500">{campaign.failedCount} fallidos</p>
                    ) : null}
                    {pending > 0 && campaign.status === "running" ? (
                      <p className="mt-1 text-[10px] text-slate-400">{pending} en cola</p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  {campaign.status === "running" ? (
                    <form action={pauseCampaignAction}>
                      <input type="hidden" name="campaignId" value={campaign.id} />
                      <Button type="submit" size="sm" variant="ghost">
                        Pausar
                      </Button>
                    </form>
                  ) : (
                    <StartCampaignButton campaignId={campaign.id} />
                  )}
                  <form action={deleteCampaignAction}>
                    <input type="hidden" name="campaignId" value={campaign.id} />
                    <ConfirmButton
                      message={`¿Eliminar la campaña "${campaign.name}"?`}
                      className="rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
                    >
                      Eliminar
                    </ConfirmButton>
                  </form>
                  <span className="ml-auto text-[11px] text-slate-400">
                    creada {relativeTime(campaign.createdAt)}
                  </span>
                </div>
              </Card>
            );
          })}

          {campaigns.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-400">
              Aún no hay campañas. Crea la primera con el formulario de la derecha.
            </Card>
          ) : null}
        </div>

        <Card className="h-fit">
          <CardTitle>Nueva campaña</CardTitle>
          <form action={saveCampaignAction} className="space-y-4 p-5">
            <Field label="Nombre interno">
              <Input name="name" required placeholder="Promo fin de mes" />
            </Field>
            <Field label="Enviar desde la línea">
              <Select name="channelId" defaultValue={channels[0]?.id ?? ""}>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mensaje" hint="Usa {{nombre}} para personalizar cada envío.">
              <Textarea
                name="body"
                rows={4}
                required
                placeholder="Hola {{nombre}}, esta semana tenemos 20% en toda la tienda 🎉"
              />
            </Field>
            <Field label="Imagen (URL opcional)">
              <Input name="mediaUrl" placeholder="https://tutienda.com/promo.jpg" />
            </Field>

            <div>
              <p className="mb-2 text-xs font-semibold text-slate-600">Enviar a estas etapas</p>
              <div className="flex flex-wrap gap-2">
                {stages.map((stage) => (
                  <label
                    key={stage.id}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  >
                    <input type="checkbox" name="stageIds" value={stage.id} className="h-3.5 w-3.5 accent-[#0f766e]" />
                    {stage.name}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-slate-600">Con estas etiquetas</p>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <label
                    key={tag.id}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  >
                    <input type="checkbox" name="tagIds" value={tag.id} className="h-3.5 w-3.5 accent-[#0f766e]" />
                    {tag.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Sin escribir hace (días)">
                <Input type="number" name="inactiveDays" placeholder="15" min={1} />
              </Field>
              <Field label="Pausa entre envíos (seg)">
                <Input type="number" name="throttleSec" defaultValue={12} min={5} />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="hasOrders" className="h-4 w-4 accent-[#0f766e]" />
              Solo clientes que ya compraron
            </label>

            <Field label="Programar para" hint="Déjalo vacío para enviar manualmente.">
              <Input type="datetime-local" name="scheduledAt" />
            </Field>

            <Button type="submit">Guardar campaña</Button>
          </form>
        </Card>
      </div>
    </PageShell>
  );
}
