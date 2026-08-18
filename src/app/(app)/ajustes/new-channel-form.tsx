"use client";

import { useActionState } from "react";
import { createChannelAction, type ActionState } from "@/app/actions/admin";
import { Button, Field, Input, Select } from "@/components/ui";

export function NewChannelForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createChannelAction, {});

  return (
    <form action={action} className="space-y-3">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Agregar línea</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" hint="Ej: Ventas, Soporte, Mayoristas">
          <Input name="name" required placeholder="Ventas" />
        </Field>
        <Field label="Tipo de conexión">
          <Select name="provider" defaultValue="baileys">
            <option value="baileys">WhatsApp por QR (no oficial)</option>
            <option value="cloud">WhatsApp Cloud API (Meta)</option>
            <option value="mock">Simulador (pruebas sin teléfono)</option>
          </Select>
        </Field>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Field label="URL del worker">
            <Input name="workerUrl" defaultValue="http://localhost:4001" />
          </Field>
        </div>
        <input type="color" name="color" defaultValue="#0f766e" className="h-10 w-12 rounded-lg border border-slate-200" />
      </div>
      {state.ok ? <p className="text-xs text-brand">{state.ok}</p> : null}
      {state.error ? <p className="text-xs text-rose-600">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Agregar línea"}
      </Button>
      <p className="text-xs text-slate-500">
        Cada línea es un número distinto con su propia sesión. El worker (<span className="font-mono">npm run wa</span>)
        atiende todas a la vez.
      </p>
    </form>
  );
}
