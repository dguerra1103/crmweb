"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login, type LoginState } from "@/app/actions/auth";
import { Button, Field, Input } from "@/components/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Entrando…" : "Entrar"}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <Field label="Correo">
        <Input name="email" type="email" autoComplete="email" required placeholder="tucorreo@empresa.com" />
      </Field>
      <Field label="Contraseña">
        <Input name="password" type="password" autoComplete="current-password" required placeholder="••••••••" />
      </Field>
      {state.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
      ) : null}
      <Submit />
    </form>
  );
}
