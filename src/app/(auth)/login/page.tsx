import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSection } from "@/lib/settings";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/inbox");
  const brand = await getSection("brand");

  return (
    <main className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-white lg:flex">
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(15,118,110,0.9), transparent 45%), radial-gradient(circle at 80% 70%, rgba(228,87,46,0.5), transparent 40%)",
          }}
        />
        <p className="relative font-mono text-xs uppercase tracking-[0.3em] text-brand-soft">{brand.name}</p>

        <div className="relative max-w-md">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">
            Atiende, vende y cobra sin salir del chat.
          </h1>
          <p className="mt-4 text-sm text-slate-300">
            Bandeja de WhatsApp en tiempo real, ficha del cliente, embudo de ventas, IA con la información de tu
            negocio y automatizaciones que hacen el seguimiento por ti.
          </p>
        </div>

        <dl className="relative grid grid-cols-3 gap-6 text-sm">
          {[
            ["Un solo lugar", "Chat, ficha y pedidos"],
            ["IA con contexto", "Responde con tus precios"],
            ["Sin perder leads", "Recordatorios automáticos"],
          ].map(([title, desc]) => (
            <div key={title}>
              <dt className="font-medium text-white">{title}</dt>
              <dd className="mt-1 text-xs text-slate-400">{desc}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Entra a tu cuenta</h2>
          <p className="mt-1 text-sm text-slate-500">Usa el correo que te dio el administrador.</p>
          <LoginForm />
          <p className="mt-8 rounded-xl bg-white/70 p-3 text-xs text-slate-500">
            Datos de prueba: <span className="font-mono">admin@crm.com</span> ·{" "}
            <span className="font-mono">admin123</span>
          </p>
        </div>
      </section>
    </main>
  );
}
