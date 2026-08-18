import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageShell } from "@/components/page-shell";
import { Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { createContactAction } from "@/app/actions/crm";

export const dynamic = "force-dynamic";

export default async function NewContactPage() {
  const user = await requireUser();
  const [stages, agents] = await Promise.all([
    prisma.stage.findMany({ orderBy: { order: "asc" } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Nuevo cliente"
        subtitle="Se crea el contacto y su conversación de WhatsApp lista para escribir."
        actions={
          <Link href="/contactos" className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm">
            Volver
          </Link>
        }
      />

      <Card className="max-w-2xl p-6">
        <form action={createContactAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre *">
            <Input name="name" required placeholder="María Gómez" />
          </Field>
          <Field label="Teléfono *" hint="Con o sin indicativo: 3001112233 se guarda como +57 300 111 2233">
            <Input name="phone" required placeholder="3001112233" inputMode="tel" />
          </Field>
          <Field label="Correo">
            <Input name="email" type="email" placeholder="maria@correo.com" />
          </Field>
          <Field label="Empresa">
            <Input name="company" placeholder="Tienda La 45" />
          </Field>
          <Field label="Etapa">
            <Select name="stageId" defaultValue={stages[0]?.id ?? ""}>
              <option value="">Sin etapa</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsable">
            <Select name="ownerId" defaultValue={user.id}>
              <option value="">Sin responsable</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">Crear y abrir chat</Button>
          </div>
        </form>
      </Card>
    </PageShell>
  );
}
