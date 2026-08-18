"use client";

import { useActionState } from "react";
import { createUserAction, type ActionState } from "@/app/actions/admin";
import { Button, Field, Input, Select } from "@/components/ui";
import { ROLES } from "@/lib/constants";

export function NewUserForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createUserAction, {});

  return (
    <form action={action} className="space-y-3">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Nuevo usuario</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre">
          <Input name="name" required placeholder="Luis Agente" />
        </Field>
        <Field label="Correo">
          <Input name="email" type="email" required placeholder="luis@empresa.com" />
        </Field>
        <Field label="Contraseña">
          <Input name="password" type="password" required minLength={6} placeholder="mínimo 6 caracteres" />
        </Field>
        <Field label="Rol">
          <Select name="role" defaultValue="agent">
            {ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="text-xs text-slate-500">
        {ROLES.map((role) => `${role.label}: ${role.desc}`).join("  ·  ")}
      </p>
      {state.ok ? <p className="text-xs text-brand">{state.ok}</p> : null}
      {state.error ? <p className="text-xs text-rose-600">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Crear usuario"}
      </Button>
    </form>
  );
}
