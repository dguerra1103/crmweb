import Link from "next/link";
import type { Route } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageShell } from "@/components/page-shell";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { money, prettyPhone, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ContactsPage({ searchParams }: PageProps<"/contactos">) {
  await requireUser();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const stageId = typeof params.stage === "string" ? params.stage : "";
  const tagId = typeof params.tag === "string" ? params.tag : "";
  const owner = typeof params.owner === "string" ? params.owner : "";

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { phone: { contains: q.replace(/\D/g, "") || q } },
      { email: { contains: q } },
      { company: { contains: q } },
    ];
  }
  if (stageId) where.stageId = stageId;
  if (owner) where.ownerId = owner;
  if (tagId) where.tags = { some: { tagId } };

  const [contacts, stages, tags, agents, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: {
        stage: true,
        owner: true,
        tags: { include: { tag: true } },
        conversations: { orderBy: { lastMessageAt: "desc" }, take: 1 },
      },
      orderBy: { lastContactAt: "desc" },
      take: 200,
    }),
    prisma.stage.findMany({ orderBy: { order: "asc" } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.contact.count(),
  ]);

  const chip = (label: string, href: string, active: boolean) => (
    <Link
      key={href + label}
      href={href as Route}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
        active ? "bg-ink text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      {label}
    </Link>
  );

  const buildHref = (patch: Record<string, string>) => {
    const sp = new URLSearchParams();
    const current = { q, stage: stageId, tag: tagId, owner, ...patch };
    for (const [key, value] of Object.entries(current)) if (value) sp.set(key, value);
    return sp.toString() ? `/contactos?${sp}` : "/contactos";
  };

  return (
    <PageShell wide>
      <PageHeader
        title="Clientes"
        subtitle={`${contacts.length} de ${total} contactos`}
        actions={
          <Link
            href="/contactos/nuevo"
            className="rounded-xl bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:bg-brand/90"
          >
            Nuevo cliente
          </Link>
        }
      />

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre, teléfono, correo o empresa"
          className="w-72 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
        {stageId ? <input type="hidden" name="stage" value={stageId} /> : null}
        {tagId ? <input type="hidden" name="tag" value={tagId} /> : null}
        {owner ? <input type="hidden" name="owner" value={owner} /> : null}
        <button type="submit" className="rounded-xl bg-ink px-3 py-2 text-sm font-medium text-white">
          Buscar
        </button>
      </form>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {chip("Todas las etapas", buildHref({ stage: "" }), !stageId)}
        {stages.map((stage) => chip(stage.name, buildHref({ stage: stage.id }), stageId === stage.id))}
        <span className="mx-1 w-px bg-slate-200" />
        {tags.map((tag) => chip(`#${tag.name}`, buildHref({ tag: tagId === tag.id ? "" : tag.id }), tagId === tag.id))}
        <span className="mx-1 w-px bg-slate-200" />
        {agents.map((agent) =>
          chip(agent.name.split(" ")[0], buildHref({ owner: owner === agent.id ? "" : agent.id }), owner === agent.id),
        )}
      </div>

      <Card>
        {contacts.length === 0 ? (
          <EmptyState title="No hay clientes con estos filtros">Prueba con otra búsqueda.</EmptyState>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-[11px] tracking-wide text-slate-400 uppercase">
              <tr>
                <th className="px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold">Etapa</th>
                <th className="px-4 py-3 font-semibold">Etiquetas</th>
                <th className="px-4 py-3 font-semibold">Responsable</th>
                <th className="px-4 py-3 text-right font-semibold">Gastado</th>
                <th className="px-4 py-3 text-right font-semibold">Último contacto</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => {
                const conversation = contact.conversations[0];
                return (
                  <tr key={contact.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <Link
                        href={(conversation ? `/inbox/${conversation.id}` : "/contactos") as Route}
                        className="flex items-center gap-3"
                      >
                        <Avatar name={contact.name} size={34} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{contact.name}</span>
                          <span className="block font-mono text-xs text-slate-400">
                            {prettyPhone(contact.phone)}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      {contact.stage ? (
                        <Badge tone="bg-slate-100 text-slate-700" dot={contact.stage.color}>
                          {contact.stage.name}
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex flex-wrap gap-1">
                        {contact.tags.map(({ tag }) => (
                          <span
                            key={tag.id}
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ background: `${tag.color}1a`, color: tag.color }}
                          >
                            {tag.name}
                          </span>
                        ))}
                        {contact.tags.length === 0 ? <span className="text-xs text-slate-300">—</span> : null}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{contact.owner?.name ?? "Sin asignar"}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-ink">
                      {money(contact.totalSpent)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-slate-400">
                      {relativeTime(contact.lastContactAt ?? contact.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </PageShell>
  );
}
