"use client";

import { useActionState } from "react";
import { syncWooAction, testWooAction, type ActionState } from "@/app/actions/admin";
import { Button } from "@/components/ui";

export function WooTestButton() {
  const [testState, test, testing] = useActionState<ActionState, FormData>(testWooAction, {});
  const [syncState, sync, syncing] = useActionState<ActionState, FormData>(syncWooAction, {});

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <form action={test}>
          <Button type="submit" variant="ghost" disabled={testing}>
            {testing ? "Probando…" : "Probar conexión"}
          </Button>
        </form>
        <form action={sync}>
          <Button type="submit" disabled={syncing}>
            {syncing ? "Sincronizando…" : "Sincronizar productos y pedidos"}
          </Button>
        </form>
      </div>
      {testState.ok ? <p className="text-xs text-brand">{testState.ok}</p> : null}
      {testState.error ? <p className="text-xs text-rose-600">{testState.error}</p> : null}
      {syncState.ok ? <p className="text-xs text-brand">{syncState.ok}</p> : null}
      {syncState.error ? <p className="text-xs text-rose-600">{syncState.error}</p> : null}
    </div>
  );
}
