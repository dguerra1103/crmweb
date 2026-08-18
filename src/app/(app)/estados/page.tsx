import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { PageShell } from "@/components/page-shell";
import { Badge, Card, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/auto-submit";
import { StatusForm } from "./status-form";
import { deleteStatusPostAction } from "@/app/actions/status";
import { parseJson, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const SCOPE_LABELS: Record<string, string> = {
  all: "Todos los contactos",
  customers: "Clientes con compras",
  tags: "Por etiqueta",
  stages: "Por etapa",
};

export default async function StatusPage() {
  await requireRole("supervisor");

  const [channels, tags, stages, posts] = await Promise.all([
    prisma.channel.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
    prisma.stage.findMany({ orderBy: { order: "asc" } }),
    prisma.statusPost.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { channel: true, author: true },
    }),
  ]);

  return (
    <PageShell wide>
      <PageHeader
        title="Estados de WhatsApp"
        subtitle="Publica promociones en tu estado sin salir del CRM y mira a cuántos clientes llegó"
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardTitle>Nuevo estado</CardTitle>
          {channels.length === 0 ? (
            <EmptyState title="Primero conecta una línea">
              Ve a Ajustes → Líneas de WhatsApp y conecta al menos un número.
            </EmptyState>
          ) : (
            <StatusForm
              channels={channels.map((c) => ({ id: c.id, name: c.name }))}
              tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
              stages={stages.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
            />
          )}
        </Card>

        <Card>
          <CardTitle aside={<span className="text-xs text-slate-400">{posts.length} publicaciones</span>}>
            Historial de estados
          </CardTitle>
          {posts.length === 0 ? (
            <EmptyState title="Todavía no has publicado estados">
              El primero que publiques aparecerá aquí con su alcance.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-slate-50">
              {posts.map((post) => {
                const audience = parseJson<{ scope?: string }>(post.audience, {});
                return (
                  <li key={post.id} className="flex items-start gap-3 px-5 py-3">
                    {post.mediaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={post.mediaUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span
                        className="grid h-14 w-14 shrink-0 place-items-center rounded-lg text-[10px] text-white"
                        style={{ background: post.background ?? "#0f766e" }}
                      >
                        Aa
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm text-ink">{post.body || "(solo imagen)"}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <Badge
                          tone={
                            post.status === "sent"
                              ? "bg-brand/10 text-brand"
                              : post.status === "failed"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-slate-100 text-slate-600"
                          }
                        >
                          {post.status === "sent" ? "Publicado" : post.status === "failed" ? "Falló" : "En curso"}
                        </Badge>
                        <span>{post.channel.name}</span>
                        <span>· {SCOPE_LABELS[audience.scope ?? "all"] ?? "Todos"}</span>
                        <span>· {post.delivered || post.recipients} contactos</span>
                        <span>· {relativeTime(post.createdAt)}</span>
                        {post.author ? <span>· {post.author.name.split(" ")[0]}</span> : null}
                      </p>
                      {post.error ? <p className="mt-1 text-[11px] text-rose-600">{post.error}</p> : null}
                    </div>

                    <form action={deleteStatusPostAction}>
                      <input type="hidden" name="postId" value={post.id} />
                      <ConfirmButton
                        message="¿Borrar este registro del historial? (el estado en WhatsApp no se toca)"
                        className="text-[11px] text-slate-400 hover:text-rose-500"
                      >
                        Borrar
                      </ConfirmButton>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
