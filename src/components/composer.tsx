"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { sendMessageAction, suggestReplyAction, type ComposerState } from "@/app/actions/inbox";

export type QuickReplyOption = { id: string; shortcut: string; title: string; body: string };

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white transition hover:bg-brand/90 disabled:opacity-50"
      title="Enviar (Enter)"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M4.5 12 20 4.5 15 20l-3.5-6.5z" />
      </svg>
    </button>
  );
}

export function Composer({
  conversationId,
  quickReplies,
  aiEnabled,
}: {
  conversationId: string;
  quickReplies: QuickReplyOption[];
  aiEnabled: boolean;
}) {
  const [value, setValue] = useState("");
  const [showQuick, setShowQuick] = useState(false);
  const [feedback, setFeedback] = useState<ComposerState>({});
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const send = (formData: FormData) => {
    const body = String(formData.get("body") ?? "").trim();
    if (!body) {
      setFeedback({ error: "Escribe un mensaje antes de enviarlo." });
      return;
    }
    // Se limpia de inmediato, como en WhatsApp: si falla, el mensaje queda
    // marcado como fallido en el hilo.
    setValue("");
    setFeedback({});
    startTransition(async () => {
      const result = await sendMessageAction({}, formData);
      if (result.error) setFeedback(result);
    });
  };

  const suggest = () => {
    setFeedback({});
    startTransition(async () => {
      const formData = new FormData();
      formData.set("conversationId", conversationId);
      const result = await suggestReplyAction({}, formData);
      if (result.suggestion) {
        setValue(result.suggestion);
        textareaRef.current?.focus();
      } else {
        setFeedback(result);
      }
    });
  };

  const filtered = useMemo(() => {
    if (!showQuick) return [];
    const term = value.slice(1).toLowerCase();
    return quickReplies
      .filter((q) => !term || q.shortcut.toLowerCase().includes(term) || q.title.toLowerCase().includes(term))
      .slice(0, 6);
  }, [showQuick, value, quickReplies]);

  const handleChange = (next: string) => {
    setValue(next);
    setShowQuick(next.startsWith("/"));
  };

  const pickQuickReply = (body: string) => {
    setValue(body);
    setShowQuick(false);
    textareaRef.current?.focus();
  };

  return (
    <div className="relative border-t border-slate-200 bg-white px-4 py-3">
      {showQuick && filtered.length > 0 ? (
        <ul className="rise absolute bottom-full left-4 z-20 mb-2 w-96 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {filtered.map((reply) => (
            <li key={reply.id}>
              <button
                type="button"
                onClick={() => pickQuickReply(reply.body)}
                className="block w-full px-3 py-2 text-left transition hover:bg-slate-50"
              >
                <span className="font-mono text-xs text-brand">{reply.shortcut}</span>
                <span className="ml-2 text-xs font-medium text-ink">{reply.title}</span>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{reply.body}</p>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {feedback.error ? <p className="mb-2 text-xs text-rose-600">{feedback.error}</p> : null}

      <form ref={formRef} action={send} className="flex items-end gap-2">
        <input type="hidden" name="conversationId" value={conversationId} />

        <button
          type="button"
          onClick={suggest}
          disabled={pending}
          title="Sugerir respuesta con IA"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 text-brand transition hover:bg-brand-soft disabled:opacity-50"
        >
          {pending ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
              <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.5 10.2 12.6 4.5 10.8 10.2 9z" />
            </svg>
          )}
        </button>

        <textarea
          ref={textareaRef}
          name="body"
          rows={1}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
            if (e.key === "Escape") setShowQuick(false);
          }}
          placeholder={
            aiEnabled
              ? "La IA está respondiendo sola. Escribe para tomar el control…"
              : "Escribe un mensaje. Usa / para respuestas rápidas"
          }
          className="max-h-40 min-h-10 flex-1 resize-y rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
        />

        <SendButton />
      </form>
    </div>
  );
}
