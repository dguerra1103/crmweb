import Link from "next/link";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { can } from "@/lib/auth";
import { Avatar, Badge, Button, Input, Select, Textarea } from "@/components/ui";
import { ConfirmButton } from "@/components/auto-submit";
import { dateTime, money, prettyPhone, relativeTime, parseJson } from "@/lib/format";
import { PRIORITIES } from "@/lib/constants";
import {
  createNoteAction,
  createTaskAction,
  deleteContactAction,
  deleteNoteAction,
  deleteTaskAction,
  setStageAction,
  toggleTagAction,
  toggleTaskAction,
  updateContactAction,
} from "@/app/actions/crm";
import { sendProductAction } from "@/app/actions/inbox";

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-b border-slate-100 px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export async function ContactPanel({
  conversationId,
  contactId,
  currentUser,
}: {
  conversationId: string;
  contactId: string;
  currentUser: SessionUser;
}) {
  const [contact, stages, tags, agents, products] = await Promise.all([
    prisma.contact.findUniqueOrThrow({
      where: { id: contactId },
      include: {
        stage: true,
        owner: true,
        tags: { include: { tag: true } },
        notes: { orderBy: { createdAt: "desc" }, take: 20, include: { author: true } },
        tasks: { orderBy: [{ done: "asc" }, { dueAt: "asc" }], take: 20, include: { assignedTo: true } },
        orders: { orderBy: { wooCreatedAt: "desc" }, take: 5 },
      },
    }),
    prisma.stage.findMany({ orderBy: { order: "asc" } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.product.findMany({ orderBy: { syncedAt: "desc" }, take: 4 }),
  ]);

  const tagIds = new Set(contact.tags.map((t) => t.tagId));

  return (
    <aside className="thin-scroll hidden h-full w-[360px] shrink-0 overflow-y-auto border-l border-slate-200 bg-white xl:block">
      <div className="flex items-center gap-3 px-4 py-4">
        <Avatar name={contact.name} size={48} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{contact.name}</p>
          <p className="font-mono text-xs text-slate-400">{prettyPhone(contact.phone)}</p>
          <p className="mt-1 text-xs text-slate-400">
            Cliente desde {dateTime(contact.createdAt)}
            {contact.lastContactAt ? ` · escribió ${relativeTime(contact.lastContactAt)}` : ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px bg-slate-100 text-center">
        <div className="bg-white py-3">
          <p className="font-mono text-sm font-semibold text-ink">{money(contact.totalSpent)}</p>
          <p className="text-[10px] tracking-wide text-slate-400 uppercase">Gastado</p>
        </div>
        <div className="bg-white py-3">
          <p className="font-mono text-sm font-semibold text-ink">{contact.ordersCount}</p>
          <p className="text-[10px] tracking-wide text-slate-400 uppercase">Compras</p>
        </div>
        <div className="bg-white py-3">
          <p className="font-mono text-sm font-semibold text-ink">
            {contact.lastOrderAt ? relativeTime(contact.lastOrderAt).replace("hace ", "") : "—"}
          </p>
          <p className="text-[10px] tracking-wide text-slate-400 uppercase">Última compra</p>
        </div>
      </div>

      <Section title="Etapa del embudo">
        <div className="flex flex-wrap gap-1.5">
          {stages.map((stage) => {
            const active = contact.stageId === stage.id;
            return (
              <form key={stage.id} action={setStageAction}>
                <input type="hidden" name="contactId" value={contact.id} />
                <input type="hidden" name="stageId" value={stage.id} />
                <button
                  type="submit"
                  className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition"
                  style={
                    active
                      ? { background: stage.color, borderColor: stage.color, color: "#fff" }
                      : { borderColor: "#e2e8f0", color: "#475569" }
                  }
                >
                  {stage.name}
                </button>
              </form>
            );
          })}
        </div>
      </Section>

      <Section title="Etiquetas">
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const active = tagIds.has(tag.id);
            return (
              <form key={tag.id} action={toggleTagAction}>
                <input type="hidden" name="contactId" value={contact.id} />
                <input type="hidden" name="tagId" value={tag.id} />
                <button
                  type="submit"
                  className="rounded-full border px-2.5 py-1 text-xs transition"
                  style={
                    active
                      ? { background: `${tag.color}1a`, borderColor: tag.color, color: tag.color }
                      : { borderColor: "#e2e8f0", color: "#94a3b8" }
                  }
                >
                  {active ? "✓ " : "+ "}
                  {tag.name}
                  {tag.waLabelId ? <span title="Sincronizada con WhatsApp Business"> ·wa</span> : null}
                </button>
              </form>
            );
          })}
          {tags.length === 0 ? <p className="text-xs text-slate-400">Crea etiquetas en Ajustes.</p> : null}
        </div>
      </Section>

      <Section title="Datos del cliente">
        <form action={updateContactAction} className="space-y-2.5">
          <input type="hidden" name="id" value={contact.id} />
          <Input name="name" defaultValue={contact.name} placeholder="Nombre" />
          <Input name="email" type="email" defaultValue={contact.email ?? ""} placeholder="Correo" />
          <Input name="company" defaultValue={contact.company ?? ""} placeholder="Empresa" />
          <Select name="ownerId" defaultValue={contact.ownerId ?? ""}>
            <option value="">Sin responsable</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm" variant="ghost" className="w-full">
            Guardar ficha
          </Button>
        </form>
      </Section>

      <Section title="Notas internas" aside={<span className="text-[10px] text-slate-400">El cliente no las ve</span>}>
        <form action={createNoteAction} className="mb-3 space-y-2">
          <input type="hidden" name="contactId" value={contact.id} />
          <Textarea name="body" rows={2} required placeholder="Ej: pidió descuento, decide el viernes…" />
          <Button type="submit" size="sm" variant="ghost" className="w-full">
            Agregar nota
          </Button>
        </form>
        <ul className="space-y-2">
          {contact.notes.map((note) => (
            <li key={note.id} className="rounded-xl bg-amber-50/70 p-2.5 ring-1 ring-amber-100">
              <p className="text-xs whitespace-pre-wrap text-slate-700">{note.body}</p>
              <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                <span>
                  {note.author?.name ?? "Sistema"} · {relativeTime(note.createdAt)}
                </span>
                <form action={deleteNoteAction}>
                  <input type="hidden" name="noteId" value={note.id} />
                  <button type="submit" className="transition hover:text-rose-500">
                    Eliminar
                  </button>
                </form>
              </div>
            </li>
          ))}
          {contact.notes.length === 0 ? <p className="text-xs text-slate-400">Sin notas todavía.</p> : null}
        </ul>
      </Section>

      <Section title="Tareas de seguimiento">
        <form action={createTaskAction} className="mb-3 space-y-2">
          <input type="hidden" name="contactId" value={contact.id} />
          <input type="hidden" name="conversationId" value={conversationId} />
          <Input name="title" required placeholder="Ej: llamar mañana para cerrar" />
          <div className="grid grid-cols-2 gap-2">
            <Input type="datetime-local" name="dueAt" />
            <Select name="priority" defaultValue="medium">
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" size="sm" variant="ghost" className="w-full">
            Crear tarea
          </Button>
        </form>
        <ul className="space-y-1.5">
          {contact.tasks.map((task) => (
            <li key={task.id} className="flex items-start gap-2">
              <form action={toggleTaskAction}>
                <input type="hidden" name="taskId" value={task.id} />
                <button
                  type="submit"
                  aria-label={task.done ? "Reabrir tarea" : "Completar tarea"}
                  className={`mt-0.5 grid h-4 w-4 place-items-center rounded border text-[10px] transition ${
                    task.done ? "border-brand bg-brand text-white" : "border-slate-300 hover:border-brand"
                  }`}
                >
                  {task.done ? "✓" : ""}
                </button>
              </form>
              <div className="min-w-0 flex-1">
                <p className={`text-xs ${task.done ? "text-slate-400 line-through" : "text-slate-700"}`}>
                  {task.title}
                </p>
                <p className="text-[10px] text-slate-400">
                  {task.dueAt ? dateTime(task.dueAt) : "Sin fecha"}
                  {task.assignedTo ? ` · ${task.assignedTo.name.split(" ")[0]}` : ""}
                </p>
              </div>
              <form action={deleteTaskAction}>
                <input type="hidden" name="taskId" value={task.id} />
                <button type="submit" className="text-[10px] text-slate-400 transition hover:text-rose-500">
                  ✕
                </button>
              </form>
            </li>
          ))}
          {contact.tasks.length === 0 ? <p className="text-xs text-slate-400">Sin tareas pendientes.</p> : null}
        </ul>
      </Section>

      <Section
        title="Pedidos"
        aside={
          <Link href="/productos" className="text-[10px] font-medium text-brand hover:underline">
            Ver catálogo
          </Link>
        }
      >
        <ul className="space-y-2">
          {contact.orders.map((order) => {
            const items = parseJson<{ name: string; qty: number }[]>(order.items, []);
            return (
              <li key={order.id} className="rounded-xl border border-slate-100 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-ink">#{order.number}</span>
                  <span className="font-mono text-xs text-ink">{money(order.total, order.currency)}</span>
                </div>
                <p className="mt-1 truncate text-[11px] text-slate-500">
                  {items.map((i) => `${i.qty}× ${i.name}`).join(", ") || "Sin detalle"}
                </p>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                  <Badge tone="bg-slate-100 text-slate-600">{order.status}</Badge>
                  <span>{dateTime(order.wooCreatedAt)}</span>
                </div>
              </li>
            );
          })}
          {contact.orders.length === 0 ? (
            <p className="text-xs text-slate-400">Sin pedidos. Sincroniza WooCommerce en Ajustes.</p>
          ) : null}
        </ul>
      </Section>

      {products.length > 0 ? (
        <Section title="Enviar producto">
          <ul className="space-y-1.5">
            {products.map((product) => (
              <li key={product.id} className="flex items-center gap-2 rounded-xl border border-slate-100 p-2">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.imageUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-[10px] text-slate-400">
                    IMG
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-ink">{product.name}</p>
                  <p className="font-mono text-[10px] text-slate-400">
                    {money(product.price)} · {product.stockStatus === "instock" ? "disponible" : "agotado"}
                  </p>
                </div>
                <form action={sendProductAction}>
                  <input type="hidden" name="conversationId" value={conversationId} />
                  <input type="hidden" name="productId" value={product.id} />
                  <Button type="submit" size="sm" variant="ghost">
                    Enviar
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {can(currentUser, "supervisor") ? (
        <Section title="Zona de riesgo">
          <form action={deleteContactAction}>
            <input type="hidden" name="contactId" value={contact.id} />
            <ConfirmButton
              message={`¿Eliminar a ${contact.name} y todo su historial? Esta acción no se puede deshacer.`}
              className="w-full rounded-xl border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
            >
              Eliminar cliente y su historial
            </ConfirmButton>
          </form>
        </Section>
      ) : null}
    </aside>
  );
}
