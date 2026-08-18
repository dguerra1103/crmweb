import type { ComponentProps, ReactNode } from "react";
import { avatarColor, initials } from "@/lib/format";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(11,29,38,0.06)] ${className}`}>
      {children}
    </section>
  );
}

export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
      <h2 className="text-sm font-semibold text-ink">{children}</h2>
      {aside}
    </div>
  );
}

export function Badge({
  tone = "bg-slate-100 text-slate-600",
  children,
  dot,
}: {
  tone?: string;
  children: ReactNode;
  dot?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} /> : null}
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "text-ink",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</p>
      <p className={`mt-2 font-mono text-[26px] leading-none font-semibold ${tone}`}>{value}</p>
      {hint ? <p className="mt-2 text-xs text-slate-400">{hint}</p> : null}
    </Card>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ background: avatarColor(name), width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {children ? <p className="mt-1 text-sm text-slate-400">{children}</p> : null}
    </div>
  );
}

const control =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-4 focus:ring-brand/10 disabled:bg-slate-50";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${control} ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${control} ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${control} ${props.className ?? ""}`} />;
}

const buttonTones = {
  primary: "bg-brand text-white hover:bg-brand/90",
  dark: "bg-ink text-white hover:bg-ink-soft",
  ghost: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  danger: "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50",
  clay: "bg-clay text-white hover:bg-clay/90",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonTones; size?: "sm" | "md" }) {
  const sizes = size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm";
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${buttonTones[variant]} ${sizes} ${className}`}
    />
  );
}
