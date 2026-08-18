export function money(amount: number, currency = "COP") {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export function shortDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(d));
}

export function timeOnly(d: Date | string) {
  return new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

export function dateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));
}

export function relativeTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return shortDate(d);
}

/** ¿La fecha ya pasó? (para tareas vencidas) */
export function isPast(date: Date | string | null | undefined) {
  if (!date) return false;
  return new Date(date).getTime() < new Date().getTime();
}

export function dateInput(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = new Date(d);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** Normaliza a solo dígitos con indicativo. 3001112233 -> 573001112233 */
export function normalizePhone(input: string, defaultCountry = "57") {
  const digits = (input || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.length <= 10 && !digits.startsWith(defaultCountry)) return `${defaultCountry}${digits}`;
  return digits;
}

export function prettyPhone(phone: string) {
  const d = (phone || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("57")) return `+57 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return d ? `+${d}` : "—";
}

export function initials(name: string) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

const AVATAR_COLORS = ["#0f766e", "#1d4ed8", "#b91c1c", "#a16207", "#7e22ce", "#0369a1", "#be185d", "#15803d"];

export function avatarColor(seed: string) {
  let sum = 0;
  for (const ch of seed || "x") sum += ch.charCodeAt(0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
