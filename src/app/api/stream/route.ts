import { getCurrentUser } from "@/lib/auth";
import { subscribe } from "@/lib/events";

export const dynamic = "force-dynamic";

/** Server-Sent Events: el inbox se refresca cuando entra o sale un mensaje. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const push = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        unsubscribe?.();
        unsubscribe = null;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
      };

      push({ type: "ready" });
      unsubscribe = subscribe(push);
      heartbeat = setInterval(() => push({ type: "ping" }), 25000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
