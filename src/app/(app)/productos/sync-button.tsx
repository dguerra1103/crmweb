"use client";

import { useActionState } from "react";
import { syncWooAction, type ActionState } from "@/app/actions/admin";
import { Button } from "@/components/ui";

export function SyncWooButton() {
  const [state, action, pending] = useActionState<ActionState, FormData>(syncWooAction, {});

  return (
    <form action={action} className="flex items-center gap-3">
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "Sincronizando…" : "Sincronizar WooCommerce"}
      </Button>
      {state.ok ? <span className="text-xs text-brand">{state.ok}</span> : null}
      {state.error ? <span className="max-w-xs text-xs text-rose-600">{state.error}</span> : null}
    </form>
  );
}
