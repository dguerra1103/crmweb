"use client";

import { useActionState, useState } from "react";
import { publishStatusAction, previewAudienceAction, type StatusState } from "@/app/actions/status";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";

type Option = { id: string; name: string; color?: string };

const BACKGROUNDS = ["#0f766e", "#0b1d26", "#e4572e", "#1d4ed8", "#7e22ce", "#b91c1c"];

export function StatusForm({
  channels,
  tags,
  stages,
}: {
  channels: Option[];
  tags: Option[];
  stages: Option[];
}) {
  const [publishState, publish, publishing] = useActionState<StatusState, FormData>(publishStatusAction, {});
  const [previewState, preview, previewing] = useActionState<StatusState, FormData>(previewAudienceAction, {});
  const [scope, setScope] = useState("all");
  const [background, setBackground] = useState(BACKGROUNDS[0]);
  const [text, setText] = useState("");

  return (
    <form
      action={publish}
      onSubmit={(e) => {
        if (!confirm("¿Publicar este estado en WhatsApp?")) e.preventDefault();
      }}
      className="space-y-4 p-5"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Publicar desde la línea">
          <Select name="channelId" required defaultValue={channels[0]?.id}>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quién lo ve">
          <Select name="scope" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">Todos los contactos</option>
            <option value="customers">Solo los que ya compraron</option>
            <option value="tags">Por etiqueta</option>
            <option value="stages">Por etapa del embudo</option>
          </Select>
        </Field>
      </div>

      {scope === "tags" ? (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <label key={tag.id} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-xs">
              <input type="checkbox" name="tagIds" value={tag.id} className="h-3.5 w-3.5 accent-[#0f766e]" />
              {tag.name}
            </label>
          ))}
        </div>
      ) : null}

      {scope === "stages" ? (
        <div className="flex flex-wrap gap-2">
          {stages.map((stage) => (
            <label key={stage.id} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-xs">
              <input type="checkbox" name="stageIds" value={stage.id} className="h-3.5 w-3.5 accent-[#0f766e]" />
              {stage.name}
            </label>
          ))}
        </div>
      ) : null}

      <Field label="Texto del estado">
        <Textarea
          name="body"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="🔥 Hoy 20% en toda la tienda. Escríbenos y te apartamos el tuyo."
        />
      </Field>

      <Field label="Imagen (URL opcional)" hint="Si pones imagen, el texto va como pie de foto.">
        <Input name="mediaUrl" placeholder="https://tutienda.com/promo.jpg" />
      </Field>

      <div>
        <p className="mb-2 text-xs font-semibold text-slate-600">Color de fondo</p>
        <div className="flex items-center gap-2">
          {BACKGROUNDS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setBackground(color)}
              aria-label={`Fondo ${color}`}
              className={`h-7 w-7 rounded-full transition ${
                background === color ? "ring-2 ring-ink ring-offset-2" : ""
              }`}
              style={{ background: color }}
            />
          ))}
          <input type="hidden" name="background" value={background} />
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background }}>
        <p className="min-h-16 text-center text-sm leading-relaxed font-medium whitespace-pre-wrap text-white">
          {text || "Así se verá tu estado"}
        </p>
      </div>

      {publishState.ok ? <p className="text-sm text-brand">{publishState.ok}</p> : null}
      {publishState.error ? <p className="text-sm text-rose-600">{publishState.error}</p> : null}
      {previewState.ok ? <p className="text-sm text-slate-500">{previewState.ok}</p> : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={publishing}>
          {publishing ? "Publicando…" : "Publicar estado"}
        </Button>
        <Button type="submit" formAction={preview} variant="ghost" disabled={previewing}>
          {previewing ? "Contando…" : "Ver a cuántos llega"}
        </Button>
      </div>

      <p className="text-xs text-slate-500">
        WhatsApp solo muestra tu estado a quien tenga tu número guardado y no te haya silenciado. Se publica
        desde la línea elegida, igual que si lo subieras desde el teléfono.
      </p>
    </form>
  );
}
