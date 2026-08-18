import Link from "next/link";
import type { Route } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageShell } from "@/components/page-shell";
import { Avatar, PageHeader } from "@/components/ui";
import { AutoSubmitSelect } from "@/components/auto-submit";
import { money, relativeTime } from "@/lib/format";
import { setStageAction } from "@/app/actions/crm";

export const dynamic = "force-dynamic";

export default async function FunnelPage() {
  await requireUser();

  const [stages, contacts] = await Promise.all([
    prisma.stage.findMany({ orderBy: { order: "asc" } }),
    prisma.contact.findMany({
      include: {
        owner: true,
        tags: { include: { tag: true } },
        conversations: { orderBy: { lastMessageAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 400,
    }),
  ]);

  const stageOptions = [
    { value: "", label: "Sin etapa" },
    ...stages.map((s) => ({ value: s.id, label: s.name })),
  ];
  const totalPipeline = contacts.reduce((sum, c) => sum + c.totalSpent, 0);

  return (
    <PageShell wide>
      <PageHeader
        title="Embudo de ventas"
        subtitle={`${contacts.length} clientes · ${money(totalPipeline)} facturado en total`}
      />

      <div className="thin-scroll flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const items = contacts.filter((c) => c.stageId === stage.id);
          const value = items.reduce((sum, c) => sum + c.totalSpent, 0);

          return (
            <section key={stage.id} className="w-[280px] shrink-0">
              <header className="mb-2 flex items-center justify-between rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
                  {stage.name}
                </span>
                <span className="font-mono text-xs text-slate-400">{items.length}</span>
              </header>
              <p className="mb-2 px-1 font-mono text-[11px] text-slate-400">{money(value)}</p>

              <ul className="space-y-2">
                {items.length === 0 ? (
                  <li className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                    Vacío
                  </li>
                ) : (
                  items.map((contact) => {
                    const conversation = contact.conversations[0];
                    return (
                      <li key={contact.id} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                        <Link
                          href={(conversation ? `/inbox/${conversation.id}` : "/contactos") as Route}
                          className="flex items-center gap-2"
                        >
                          <Avatar name={contact.name} size={30} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">{contact.name}</span>
                            <span className="block text-[11px] text-slate-400">
                              {contact.owner?.name.split(" ")[0] ?? "Sin dueño"} ·{" "}
                              {relativeTime(contact.lastContactAt ?? contact.createdAt)}
                            </span>
                          </span>
                        </Link>

                        {contact.tags.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {contact.tags.map(({ tag }) => (
                              <span
                                key={tag.id}
                                className="rounded-full px-1.5 py-0.5 text-[10px]"
                                style={{ background: `${tag.color}1a`, color: tag.color }}
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] text-slate-500">{money(contact.totalSpent)}</span>
                          <form action={setStageAction}>
                            <input type="hidden" name="contactId" value={contact.id} />
                            <AutoSubmitSelect
                              name="stageId"
                              title="Mover de etapa"
                              defaultValue={contact.stageId ?? ""}
                              options={stageOptions}
                              className="rounded-lg border border-slate-200 px-1.5 py-1 text-[11px] text-slate-600 outline-none"
                            />
                          </form>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
