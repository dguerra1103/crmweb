"use client";

import { useActionState } from "react";
import { testAiAction, type AiTestState } from "@/app/actions/ai";
import { Button, Input } from "@/components/ui";

export function AiTester() {
  const [state, action, pending] = useActionState<AiTestState, FormData>(testAiAction, {});

  return (
    <div className="px-5 py-5">
      <form action={action} className="flex gap-2">
        <Input name="question" placeholder="¿Cuánto demora el envío a Cali?" />
        <Button type="submit" disabled={pending}>
          {pending ? "Pensando…" : "Probar"}
        </Button>
      </form>

      {state.error ? (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}

      {state.answer ? (
        <div className="mt-3 rounded-2xl rounded-bl-md bg-brand-soft px-4 py-3 text-sm whitespace-pre-wrap text-ink">
          {state.answer}
        </div>
      ) : null}
    </div>
  );
}
