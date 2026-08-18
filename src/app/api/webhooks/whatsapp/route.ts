import { NextResponse } from "next/server";
import { handleInbound } from "@/lib/messaging";

export const dynamic = "force-dynamic";

const SECRET = process.env.WA_WORKER_SECRET || "dev-worker-secret";

type CloudWebhook = {
  entry?: {
    changes?: {
      value?: {
        contacts?: { profile?: { name?: string }; wa_id?: string }[];
        messages?: {
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
          image?: { caption?: string };
          document?: { filename?: string };
        }[];
      };
    }[];
  }[];
};

/** Verificación del webhook de Meta Cloud API. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === (process.env.META_VERIFY_TOKEN || SECRET)) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown> & CloudWebhook;

  // 1) Worker Baileys local (autenticado con el secreto compartido).
  if (request.headers.get("x-worker-secret") === SECRET && typeof body.phone === "string") {
    const result = await handleInbound({
      session: typeof body.session === "string" ? body.session : undefined,
      phone: body.phone,
      name: typeof body.name === "string" ? body.name : undefined,
      text: typeof body.text === "string" ? body.text : "",
      type: (body.type as "text" | "image" | "audio" | "video" | "document") ?? "text",
      externalId: typeof body.externalId === "string" ? body.externalId : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  }

  // 2) Meta Cloud API.
  const value = body.entry?.[0]?.changes?.[0]?.value;
  if (value?.messages?.length) {
    const name = value.contacts?.[0]?.profile?.name;
    for (const message of value.messages) {
      if (!message.from) continue;
      await handleInbound({
        phone: message.from,
        name,
        text: message.text?.body ?? message.image?.caption ?? message.document?.filename ?? "",
        type: (message.type as "text" | "image" | "audio" | "video" | "document") ?? "text",
        externalId: message.id,
      });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "payload no reconocido" }, { status: 400 });
}
