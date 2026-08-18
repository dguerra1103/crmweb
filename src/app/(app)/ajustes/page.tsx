import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getSettings, maskSecret } from "@/lib/settings";
import { getProviderFor } from "@/lib/channel";
import { PageShell } from "@/components/page-shell";
import { Badge, Button, Card, CardTitle, Field, Input, PageHeader, Select } from "@/components/ui";
import { ConfirmButton } from "@/components/auto-submit";
import { ChannelPanel } from "./channel-panel";
import { WooTestButton } from "./woo-test-button";
import { NewUserForm } from "./new-user-form";
import { NewChannelForm } from "./new-channel-form";
import { ROLES } from "@/lib/constants";
import { relativeTime } from "@/lib/format";
import {
  deleteStageAction,
  deleteTagAction,
  createStageAction,
  createTagAction,
} from "@/app/actions/crm";
import {
  deleteChannelAction,
  deleteUserAction,
  saveBrandAction,
  saveBusinessAction,
  saveWooAction,
  updateChannelAction,
  updateUserAction,
} from "@/app/actions/admin";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const currentUser = await requireRole("admin");

  const [settings, channels, users, stages, tags] = await Promise.all([
    getSettings(),
    prisma.channel.findMany({
      orderBy: { order: "asc" },
      include: { _count: { select: { conversations: true } } },
    }),
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.stage.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { contacts: true } } } }),
    prisma.tag.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { contacts: true } } } }),
  ]);

  // Estado real de cada línea (consulta al worker o a Meta).
  const lines = await Promise.all(
    channels.map(async (channel) => ({ channel, status: await getProviderFor(channel).status() })),
  );
  const connectedCount = lines.filter((line) => line.status.connected).length;

  return (
    <PageShell wide>
      <PageHeader
        title="Ajustes"
        subtitle="Adapta el CRM a tu negocio: canal, marca, equipo, embudo y tienda"
        actions={
          <Badge tone={connectedCount > 0 ? "bg-brand/10 text-brand" : "bg-slate-100 text-slate-600"}>
            {connectedCount} de {lines.length} líneas conectadas
          </Badge>
        }
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="xl:col-span-2">
          <CardTitle aside={<span className="text-xs text-slate-400">{lines.length} líneas</span>}>
            Líneas de WhatsApp
          </CardTitle>

          <div className="grid gap-5 p-5 lg:grid-cols-2 2xl:grid-cols-3">
            {lines.map(({ channel, status }) => (
              <div key={channel.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: channel.color }} />
                  <span className="flex-1 text-sm font-semibold text-ink">{channel.name}</span>
                  <span className="font-mono text-[11px] text-slate-400">
                    {channel._count.conversations} chats
                  </span>
                </div>

                <form action={updateChannelAction} className="mb-3 space-y-2">
                  <input type="hidden" name="channelId" value={channel.id} />
                  <Input name="name" defaultValue={channel.name} />
                  <Select name="provider" defaultValue={channel.provider}>
                    <option value="baileys">WhatsApp por QR (no oficial)</option>
                    <option value="cloud">WhatsApp Cloud API (Meta)</option>
                    <option value="mock">Simulador (pruebas sin teléfono)</option>
                  </Select>
                  <Input name="workerUrl" defaultValue={channel.workerUrl} placeholder="http://localhost:4001" />
                  {channel.provider === "cloud" ? (
                    <>
                      <Input
                        name="phoneNumberId"
                        defaultValue={channel.phoneNumberId ?? ""}
                        placeholder="Phone Number ID"
                      />
                      <Input
                        name="accessToken"
                        defaultValue={maskSecret(channel.accessToken ?? "")}
                        placeholder="Token de Meta"
                      />
                    </>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      name="color"
                      defaultValue={channel.color}
                      className="h-9 w-10 rounded-lg border border-slate-200"
                    />
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        name="active"
                        defaultChecked={channel.active}
                        className="h-4 w-4 accent-[#0f766e]"
                      />
                      Activa
                    </label>
                    <Button type="submit" size="sm" variant="ghost" className="ml-auto">
                      Guardar
                    </Button>
                  </div>
                </form>

                <ChannelPanel
                  channelId={channel.id}
                  connected={status.connected}
                  qr={status.qr}
                  detail={status.detail}
                  phone={status.phone}
                  provider={channel.provider}
                />

                {status.history && status.history.messages > 0 ? (
                  <p className="mt-3 text-[11px] text-slate-400">
                    Historial: {status.history.messages} mensajes · {status.history.chats} chats (
                    {status.history.progress}%)
                  </p>
                ) : null}

                {lines.length > 1 ? (
                  <form action={deleteChannelAction} className="mt-3">
                    <input type="hidden" name="channelId" value={channel.id} />
                    <ConfirmButton
                      message={`¿Eliminar la línea "${channel.name}"? Sus chats quedarán sin línea asignada.`}
                      className="text-[11px] text-slate-400 hover:text-rose-500"
                    >
                      Eliminar línea
                    </ConfirmButton>
                  </form>
                ) : null}
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 bg-slate-50/50 p-5">
            <NewChannelForm />
          </div>

          <div className="border-t border-slate-100 px-5 py-4">
            <h3 className="text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">
              Sincronización con los teléfonos
            </h3>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Historial importado</dt>
                <dd className="mt-1 font-mono text-lg text-ink">{settings.sync.importedMessages}</dd>
                <dd className="text-[11px] text-slate-400">
                  mensajes en {settings.sync.importedChats} chats
                  {settings.sync.historyStatus === "running" ? ` · ${settings.sync.historyProgress}%` : ""}
                  {settings.sync.historyStatus === "complete" ? " · completo" : ""}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Etiquetas de WhatsApp</dt>
                <dd className="mt-1 font-mono text-lg text-ink">{settings.sync.labelsSynced}</dd>
                <dd className="text-[11px] text-slate-400">
                  {settings.sync.lastLabelAt
                    ? `última ${relativeTime(settings.sync.lastLabelAt)}`
                    : "aún sin sincronizar"}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              El historial llega solo en el momento de vincular el teléfono y WhatsApp decide cuánto manda
              (normalmente los chats y mensajes recientes, no todo el archivo). Las etiquetas requieren que el
              número sea WhatsApp <strong>Business</strong>; se sincronizan en ambos sentidos.
            </p>
          </div>
        </Card>

        <Card>
          <CardTitle>Marca y negocio</CardTitle>
          <form action={saveBrandAction} className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2">
            <Field label="Nombre del negocio">
              <Input name="name" defaultValue={settings.brand.name} required />
            </Field>
            <Field label="Descripción corta">
              <Input name="tagline" defaultValue={settings.brand.tagline} />
            </Field>
            <Field label="Moneda">
              <Select name="currency" defaultValue={settings.brand.currency}>
                <option value="COP">COP — Peso colombiano</option>
                <option value="MXN">MXN — Peso mexicano</option>
                <option value="USD">USD — Dólar</option>
                <option value="ARS">ARS — Peso argentino</option>
                <option value="PEN">PEN — Sol</option>
                <option value="CLP">CLP — Peso chileno</option>
                <option value="EUR">EUR — Euro</option>
              </Select>
            </Field>
            <Field label="Indicativo del país" hint="Se agrega a los teléfonos sin código">
              <Input name="countryCode" defaultValue={settings.brand.countryCode} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit">Guardar marca</Button>
            </div>
          </form>

          <form action={saveBusinessAction} className="grid gap-3 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Mensaje de bienvenida">
                <Input name="welcomeMessage" defaultValue={settings.business.welcomeMessage} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Mensaje fuera de horario">
                <Input name="awayMessage" defaultValue={settings.business.awayMessage} />
              </Field>
            </div>
            <Field label="Abre a las">
              <Input type="time" name="workStart" defaultValue={settings.business.workStart} />
            </Field>
            <Field label="Cierra a las">
              <Input type="time" name="workEnd" defaultValue={settings.business.workEnd} />
            </Field>
            <Field label="Avisar si no hay respuesta en (min)">
              <Input type="number" name="noReplyMinutes" defaultValue={settings.business.noReplyMinutes} min={5} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit">Guardar horario</Button>
            </div>
          </form>
        </Card>

        <Card>
          <CardTitle>WooCommerce</CardTitle>
          <form action={saveWooAction} className="grid gap-3 p-5">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={settings.woo.enabled}
                className="h-4 w-4 accent-[#0f766e]"
              />
              Activar la integración
            </label>
            <Field label="URL de la tienda">
              <Input name="url" defaultValue={settings.woo.url} placeholder="https://mitienda.com" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Consumer key">
                <Input name="consumerKey" defaultValue={maskSecret(settings.woo.consumerKey)} placeholder="ck_..." />
              </Field>
              <Field label="Consumer secret">
                <Input
                  name="consumerSecret"
                  defaultValue={maskSecret(settings.woo.consumerSecret)}
                  placeholder="cs_..."
                />
              </Field>
            </div>
            <p className="text-xs text-slate-500">
              Genera las llaves en WooCommerce → Ajustes → Avanzado → API REST, con permiso de lectura.
            </p>
            <div className="flex items-center gap-2">
              <Button type="submit">Guardar tienda</Button>
            </div>
          </form>
          <div className="border-t border-slate-100 px-5 py-4">
            <WooTestButton />
          </div>
        </Card>

        <Card>
          <CardTitle aside={<span className="text-xs text-slate-400">{users.length} usuarios</span>}>
            Equipo y permisos
          </CardTitle>
          <ul className="divide-y divide-slate-50">
            {users.map((user) => (
              <li key={user.id} className="px-5 py-3">
                <form action={updateUserAction} className="grid items-end gap-2 sm:grid-cols-[1fr_140px_auto]">
                  <input type="hidden" name="userId" value={user.id} />
                  <div>
                    <Input name="name" defaultValue={user.name} />
                    <p className="mt-1 font-mono text-[11px] text-slate-400">
                      {user.email}
                      {user.lastSeenAt ? ` · visto ${relativeTime(user.lastSeenAt)}` : ""}
                    </p>
                  </div>
                  <Select name="role" defaultValue={user.role}>
                    {ROLES.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </Select>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        name="active"
                        defaultChecked={user.active}
                        className="h-4 w-4 accent-[#0f766e]"
                      />
                      Activo
                    </label>
                    <Button type="submit" size="sm" variant="ghost">
                      Guardar
                    </Button>
                  </div>
                  <div className="sm:col-span-3">
                    <Input
                      name="password"
                      type="password"
                      placeholder="Nueva contraseña (opcional)"
                      className="text-xs"
                    />
                  </div>
                </form>
                {user.id !== currentUser.id ? (
                  <form action={deleteUserAction} className="mt-2">
                    <input type="hidden" name="userId" value={user.id} />
                    <ConfirmButton
                      message={`¿Eliminar al usuario ${user.name}?`}
                      className="text-[11px] text-slate-400 hover:text-rose-500"
                    >
                      Eliminar usuario
                    </ConfirmButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-100 bg-slate-50/50 p-5">
            <NewUserForm />
          </div>
        </Card>

        <Card>
          <CardTitle>Etapas del embudo</CardTitle>
          <ul className="divide-y divide-slate-50">
            {stages.map((stage) => (
              <li key={stage.id} className="flex items-center gap-2 px-5 py-2.5">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: stage.color }} />
                <span className="flex-1 text-sm text-ink">{stage.name}</span>
                <span className="font-mono text-xs text-slate-400">{stage._count.contacts}</span>
                <form action={deleteStageAction}>
                  <input type="hidden" name="stageId" value={stage.id} />
                  <ConfirmButton
                    message={`¿Eliminar la etapa "${stage.name}"? Los clientes quedarán sin etapa.`}
                    className="text-[11px] text-slate-400 hover:text-rose-500"
                  >
                    Eliminar
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
          <form action={createStageAction} className="flex items-end gap-2 border-t border-slate-100 p-5">
            <div className="flex-1">
              <Field label="Nueva etapa">
                <Input name="name" required placeholder="Post venta" />
              </Field>
            </div>
            <input type="color" name="color" defaultValue="#0ea5e9" className="h-10 w-12 rounded-lg border border-slate-200" />
            <Button type="submit" variant="ghost">
              Agregar
            </Button>
          </form>
        </Card>

        <Card>
          <CardTitle>Etiquetas</CardTitle>
          <ul className="divide-y divide-slate-50">
            {tags.map((tag) => (
              <li key={tag.id} className="flex items-center gap-2 px-5 py-2.5">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: tag.color }} />
                <span className="flex-1 text-sm text-ink">
                  {tag.name}
                  {tag.waLabelId ? (
                    <span className="ml-2 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                      WhatsApp
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-xs text-slate-400">{tag._count.contacts}</span>
                <form action={deleteTagAction}>
                  <input type="hidden" name="tagId" value={tag.id} />
                  <ConfirmButton
                    message={`¿Eliminar la etiqueta "${tag.name}"?`}
                    className="text-[11px] text-slate-400 hover:text-rose-500"
                  >
                    Eliminar
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
          <p className="border-t border-slate-100 px-5 pt-4 text-xs text-slate-500">
            Las marcadas como <span className="font-medium text-brand">WhatsApp</span> son tus etiquetas de
            WhatsApp Business: al ponerlas o quitarlas aquí también cambian en el teléfono.
          </p>
          <form action={createTagAction} className="flex items-end gap-2 p-5">
            <div className="flex-1">
              <Field label="Nueva etiqueta">
                <Input name="name" required placeholder="VIP" />
              </Field>
            </div>
            <input type="color" name="color" defaultValue="#0f766e" className="h-10 w-12 rounded-lg border border-slate-200" />
            <Button type="submit" variant="ghost">
              Agregar
            </Button>
          </form>
        </Card>
      </div>
    </PageShell>
  );
}
