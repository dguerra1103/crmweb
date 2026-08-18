"use client";

import { useActionState } from "react";
import { startCampaignAction, type ActionState } from "@/app/actions/admin";
import { Button } from "@/components/ui";

export function StartCampaignButton({ campaignId }: { campaignId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(startCampaignAction, {});

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("¿Enviar esta campaña a todos los contactos del segmento?")) e.preventDefault();
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="campaignId" value={campaignId} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Enviando…" : "Iniciar envío"}
      </Button>
      {state.ok ? <span className="text-xs text-brand">{state.ok}</span> : null}
      {state.error ? <span className="text-xs text-rose-600">{state.error}</span> : null}
    </form>
  );
}
