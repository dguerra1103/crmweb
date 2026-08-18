"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { connectChannelAction, logoutChannelAction, type ActionState } from "@/app/actions/admin";
import { Button } from "@/components/ui";

/** Conexión de una línea: estado, QR y botones. */
export function ChannelPanel({
  channelId,
  connected,
  qr,
  detail,
  phone,
  provider,
}: {
  channelId: string;
  connected: boolean;
  qr?: string | null;
  detail?: string;
  phone?: string | null;
  provider: string;
}) {
  const router = useRouter();
  const [connectState, connect, connecting] = useActionState<ActionState, FormData>(connectChannelAction, {});
  const [logoutState, doLogout, loggingOut] = useActionState<ActionState, FormData>(logoutChannelAction, {});

  // Mientras espera el QR o el emparejamiento, refresca el estado cada 4 segundos.
  useEffect(() => {
    if (connected || provider !== "baileys") return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [connected, provider, router]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-brand" : "bg-slate-300"}`} aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {connected ? `Conectada${phone ? ` como +${phone}` : ""}` : "Sin conectar"}
          </p>
          {detail ? <p className="text-xs text-slate-500">{detail}</p> : null}
        </div>
      </div>

      {qr ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Código QR de WhatsApp" className="mx-auto h-56 w-56" />
          <p className="mt-3 text-xs text-slate-500">
            WhatsApp del teléfono → Ajustes → Dispositivos vinculados → Vincular un dispositivo.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <form action={connect}>
          <input type="hidden" name="channelId" value={channelId} />
          <Button type="submit" size="sm" disabled={connecting}>
            {connecting ? "Conectando…" : connected ? "Reconectar" : "Conectar"}
          </Button>
        </form>
        <form action={doLogout}>
          <input type="hidden" name="channelId" value={channelId} />
          <Button type="submit" size="sm" variant="ghost" disabled={loggingOut}>
            {loggingOut ? "Cerrando…" : "Cerrar sesión"}
          </Button>
        </form>
      </div>

      {connectState.ok || logoutState.ok ? (
        <p className="text-xs text-brand">{connectState.ok ?? logoutState.ok}</p>
      ) : null}
      {connectState.error || logoutState.error ? (
        <p className="text-xs text-rose-600">{connectState.error ?? logoutState.error}</p>
      ) : null}
    </div>
  );
}
