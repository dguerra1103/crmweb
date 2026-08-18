"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type RailItem = { href: Route; label: string; icon: string; badge?: number };

const ICONS: Record<string, ReactNode> = {
  inbox: (
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-5 4z" />
  ),
  users: <path d="M16 19v-1.5A3.5 3.5 0 0 0 12.5 14h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.2a3.5 3.5 0 0 1 0 6.6" />,
  funnel: <path d="M4 5h16l-6 7v6l-4 2v-8z" />,
  box: <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5zM4 8.5 12 13l8-4.5M12 13v7" />,
  send: <path d="M4.5 12 20 4.5 15 20l-3.5-6.5z" />,
  bolt: <path d="M13 3 5 13h6l-1 8 8-10h-6z" />,
  spark: <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.5 10.2 12.6 4.5 10.8 10.2 9z" />,
  chart: <path d="M5 19V9m7 10V5m7 14v-7" />,
  history: <path d="M4 12a8 8 0 1 0 2.3-5.6M4 5v4h4M12 8v4.5l3 1.8" />,
  megaphone: <path d="M4 10v4a1 1 0 0 0 1 1h2l4 4V5L7 9H5a1 1 0 0 0-1 1M16 8.5a4.5 4.5 0 0 1 0 7" />,
  bell: <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9M10 19a2 2 0 0 0 4 0" />,
  gear: (
    <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M19.5 12c0-.5-.05-1-.15-1.45l1.75-1.3-1.9-3.3-2.05.85a7 7 0 0 0-2.5-1.45L14.3 3H9.7l-.35 2.35a7 7 0 0 0-2.5 1.45L4.8 5.95l-1.9 3.3 1.75 1.3a7.4 7.4 0 0 0 0 2.9l-1.75 1.3 1.9 3.3 2.05-.85a7 7 0 0 0 2.5 1.45L9.7 21h4.6l.35-2.35a7 7 0 0 0 2.5-1.45l2.05.85 1.9-3.3-1.75-1.3c.1-.45.15-.95.15-1.45" />
  ),
};

export function AppRail({ items, footer }: { items: RailItem[]; footer: ReactNode }) {
  const pathname = usePathname();

  return (
    <nav className="flex h-full w-[68px] shrink-0 flex-col items-center gap-1 border-r border-black/20 bg-ink py-4">
      <Link href="/inbox" className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-brand text-sm font-bold text-white">
        CR
      </Link>

      {items.map((item) => {
        const active = item.href === "/inbox" ? pathname.startsWith("/inbox") : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            className={`group relative grid h-11 w-11 place-items-center rounded-xl transition ${
              active ? "bg-white/12 text-white" : "text-slate-400 hover:bg-white/8 hover:text-white"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              {ICONS[item.icon]}
            </svg>
            {item.badge ? (
              <span className="absolute top-1.5 right-1.5 min-w-4 rounded-full bg-clay px-1 text-center font-mono text-[10px] leading-4 text-white">
                {item.badge > 99 ? "99" : item.badge}
              </span>
            ) : null}
            <span className="pointer-events-none absolute left-[54px] z-30 hidden whitespace-nowrap rounded-lg bg-ink-soft px-2 py-1 text-xs text-white shadow-lg group-hover:block">
              {item.label}
            </span>
          </Link>
        );
      })}

      <div className="mt-auto">{footer}</div>
    </nav>
  );
}
