export const ROLES = [
  { value: "admin", label: "Administrador", desc: "Control total: usuarios, ajustes, campañas, IA." },
  { value: "supervisor", label: "Supervisor", desc: "Ve todo, reasigna, reporta. No toca ajustes críticos." },
  { value: "agent", label: "Agente", desc: "Atiende sus conversaciones y clientes asignados." },
] as const;

export type Role = (typeof ROLES)[number]["value"];

export const ROLE_RANK: Record<Role, number> = { agent: 1, supervisor: 2, admin: 3 };

export const CONVERSATION_STATUSES = [
  { value: "open", label: "Abierta", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "pending", label: "Pendiente", tone: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "closed", label: "Cerrada", tone: "bg-slate-100 text-slate-600 border-slate-200" },
] as const;

export const PRIORITIES = [
  { value: "low", label: "Baja", tone: "bg-slate-100 text-slate-600" },
  { value: "medium", label: "Media", tone: "bg-sky-100 text-sky-700" },
  { value: "high", label: "Alta", tone: "bg-rose-100 text-rose-700" },
] as const;

export const KNOWLEDGE_KINDS = [
  { value: "product", label: "Producto" },
  { value: "price", label: "Precios" },
  { value: "faq", label: "Pregunta frecuente" },
  { value: "policy", label: "Política" },
  { value: "note", label: "Nota" },
] as const;

export const AUTOMATION_TRIGGERS = [
  { value: "message_received", label: "Llega un mensaje del cliente" },
  { value: "tag_added", label: "Se agrega una etiqueta" },
  { value: "stage_changed", label: "Cambia de etapa el cliente" },
  { value: "order_paid", label: "Se registra una compra pagada" },
  { value: "no_reply", label: "Pasa X tiempo sin respuesta" },
] as const;

export const AUTOMATION_ACTIONS = [
  { value: "send_message", label: "Enviar mensaje" },
  { value: "add_tag", label: "Agregar etiqueta" },
  { value: "set_stage", label: "Mover de etapa" },
  { value: "assign_agent", label: "Asignar agente" },
  { value: "create_task", label: "Crear tarea" },
  { value: "set_status", label: "Cambiar estado de la conversación" },
  { value: "toggle_ai", label: "Activar/desactivar IA" },
] as const;

export const BOT_MATCHES = [
  { value: "contains", label: "Contiene alguna palabra" },
  { value: "equals", label: "Es exactamente" },
  { value: "starts", label: "Empieza con" },
  { value: "regex", label: "Expresión regular" },
  { value: "welcome", label: "Primer mensaje del cliente" },
  { value: "fallback", label: "Si nada más coincide" },
] as const;

export const DEFAULT_STAGES = [
  { name: "Nuevo", color: "#64748b", order: 0 },
  { name: "Interesado", color: "#0ea5e9", order: 1 },
  { name: "Cotización", color: "#6366f1", order: 2 },
  { name: "Pago pendiente", color: "#f59e0b", order: 3 },
  { name: "Cliente", color: "#10b981", order: 4, isWon: true },
  { name: "Seguimiento", color: "#8b5cf6", order: 5 },
];
