"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Escucha los eventos del servidor (SSE) y refresca los datos de la página.
 * Así el inbox se actualiza solo cuando entra o sale un mensaje.
 */
export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let pending: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      source = new EventSource("/api/stream");

      source.onmessage = (event) => {
        const data = JSON.parse(event.data) as { type?: string };
        if (!data.type || data.type === "ping" || data.type === "ready") return;
        // Agrupa ráfagas de eventos en un solo refresco.
        if (pending) clearTimeout(pending);
        pending = setTimeout(() => router.refresh(), 250);
      };

      source.onerror = () => {
        source?.close();
        retry = setTimeout(connect, 4000);
      };
    };

    connect();
    return () => {
      source?.close();
      if (retry) clearTimeout(retry);
      if (pending) clearTimeout(pending);
    };
  }, [router]);

  return null;
}
