# CRM WhatsApp

CRM de ventas, atención y automatización sobre WhatsApp: bandeja tipo WhatsApp Web, ficha del cliente,
embudo, IA con la información del negocio, automatizaciones, campañas y catálogo de WooCommerce.

Stack: Next.js 16 (App Router + Server Actions) · TypeScript · Prisma 6 · SQLite · Tailwind CSS 4 · Baileys.

---

## Arrancar en 4 pasos

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

App en http://localhost:3000 — entra con `admin@crm.com` / `admin123`.

En **otra terminal**, para conectar WhatsApp por QR:

```bash
npm run wa
```

Luego ve a **Ajustes → Líneas de WhatsApp → Conectar** y escanea el código con
WhatsApp → Dispositivos vinculados. Un solo worker atiende todas las líneas y debe quedarse abierto mientras
uses el CRM.

Para que corran las automatizaciones de "sin respuesta" y las campañas por lotes, llama cada minuto a:

```bash
curl -H "x-cron-secret: dev-cron-secret" http://localhost:3000/api/cron
```

(en Windows: Programador de tareas → acción cada minuto con ese comando).

---

## Usuarios de prueba

| Correo | Rol | Qué puede hacer |
| --- | --- | --- |
| `admin@crm.com` | Administrador | Todo: ajustes, canal, usuarios, IA, campañas |
| `ana@crm.com` | Supervisora | Ve todo, reasigna, campañas, automatizaciones, IA |
| `luis@crm.com` | Agente | Atiende conversaciones y clientes |

Contraseña para los tres: `admin123`.

---

## Qué incluye

**Conversaciones** — bandeja tipo WhatsApp con filtros (no leídos, míos, pendientes, favoritos, cerrados),
búsqueda por nombre o teléfono, hilo en tiempo real (SSE), estados de entrega, respuestas rápidas con `/`,
sugerencia de respuesta con IA, asignación a un agente y cambio de estado.

**Ficha del cliente** (panel derecho) — datos, etapa del embudo en un clic, etiquetas, notas internas
(invisibles para el cliente), tareas de seguimiento, historial de pedidos y envío de productos con imagen,
precio y enlace.

**Embudo** — Nuevo → Interesado → Cotización → Pago pendiente → Cliente → Seguimiento, configurable en Ajustes.

**IA** — base de conocimiento (productos, precios, preguntas frecuentes, políticas) que alimenta las
respuestas; se activa o desactiva **por conversación**; modo "solo sugerir" o "responder automáticamente";
probador incluido; pasa el chat a un humano cuando el cliente lo pide.

**Chatbot y automatizaciones** — reglas por palabra clave (bienvenida, contiene, empieza con, regex,
fallback) y automatizaciones por evento: llega un mensaje, se agrega una etiqueta, cambia la etapa, se
registra una compra, o pasa X tiempo sin respuesta. Acciones: enviar mensaje, etiquetar, mover de etapa,
asignar agente, crear tarea, cambiar estado, encender/apagar la IA.

**Varias líneas de WhatsApp** — conecta los números que necesites (ventas, soporte, mayoristas). Cada línea
tiene su propia sesión y su QR; la bandeja se filtra por línea y cada chat muestra de qué número viene. Las
campañas y los estados eligen desde qué línea salen.

**Estados de WhatsApp** — publica promociones en tu estado desde el CRM, con texto o imagen, eligiendo el
público (todos, solo quienes ya compraron, por etiqueta o por etapa) y con vista previa. Queda el historial
con el alcance de cada publicación.

**Alertas y recordatorios** — un centro de avisos con contador en la barra lateral: tareas vencidas, clientes
esperando respuesta, envíos fallidos, campañas terminadas y líneas que se conectan. Los agentes ven lo suyo;
supervisores y administradores ven lo de todo el equipo.

**Campañas** — mensajes masivos segmentados por etapa, etiqueta, compras previas o inactividad, con
personalización `{{nombre}}` y envío por lotes.

**Historial de WhatsApp** — al vincular el teléfono, el CRM importa los chats y mensajes que WhatsApp
comparte con el dispositivo nuevo: crea los contactos, arma los hilos con sus fechas reales y no dispara
chatbot ni IA sobre mensajes viejos. Los chats con actividad del último mes entran a la bandeja; los más
antiguos quedan en "Cerrados" (siguen buscables). La importación es idempotente: repetir un lote no duplica
nada.

**Etiquetas de WhatsApp Business** — se sincronizan en ambos sentidos. Las que ya tienes en el teléfono
aparecen como etiquetas del CRM (marcadas con `WhatsApp`), y ponerlas o quitarlas desde la ficha del cliente
las cambia también en el teléfono. Si ya tenías una etiqueta del CRM con el mismo nombre, se enlaza en vez de
duplicarse.

**WooCommerce** — sincroniza productos (imagen, precio, stock, enlace) y pedidos, y los vincula al cliente
por teléfono para ver compras y valor total gastado.

**Panel** — mensajes del día, chats abiertos, clientes nuevos, ventas del mes, conversión, mensajes por día,
clientes por etapa, rendimiento por agente y tareas pendientes.

**Actividad** — historial de acciones de cada trabajador.

---

## Variables de entorno (`.env`)

| Variable | Para qué |
| --- | --- |
| `DATABASE_URL` | Base SQLite local (`file:./dev.db`) |
| `AUTH_SECRET` | Firma de la sesión. **Cámbiala** antes de publicar |
| `WA_WORKER_SECRET` | Clave compartida entre el CRM y el worker de WhatsApp |
| `CRON_SECRET` | Protege `/api/cron` |
| `CRM_URL` | URL del CRM que usa el worker para entregar mensajes |
| `ANTHROPIC_API_KEY` | IA con Claude |
| `OPENAI_API_KEY` | IA con OpenAI (alternativa) |
| `META_VERIFY_TOKEN` | Solo si usas WhatsApp Cloud API |

---

## Los tres canales de WhatsApp

Se eligen por línea en **Ajustes → Líneas de WhatsApp**, sin tocar código:

| Canal | Cuándo usarlo | Ojo con |
| --- | --- | --- |
| **QR (Baileys)** | Ahora mismo, sin cuenta Business | Integración no oficial: enviar masivamente puede hacer que Meta bloquee el número. Es el único canal con historial y etiquetas |
| **Cloud API (Meta)** | Producción seria, plantillas oficiales | Requiere cuenta Meta Business, número verificado y webhook público apuntando a `/api/webhooks/whatsapp` |
| **Simulador** | Probar bot, IA y automatizaciones sin teléfono | No sale nada real a WhatsApp |

---

## Historial y etiquetas: qué esperar de verdad

**Historial.** WhatsApp solo entrega historial en el momento de **vincular** el dispositivo, y decide él
cuánto manda: normalmente los chats y mensajes recientes, no el archivo completo de años. Tampoco viajan las
fotos y audios viejos, solo el texto y el tipo de adjunto. Si ya tenías el CRM vinculado y quieres reintentar
la importación, hay que cerrar sesión en Ajustes → Canal y volver a escanear el QR. El avance se ve en
Ajustes → Canal → Sincronización.

**Estados.** Se publican desde la línea elegida, igual que si los subieras del teléfono. WhatsApp solo los
muestra a quien tenga tu número guardado y no te haya silenciado, así que el alcance real siempre es menor
que el número de contactos del segmento. Solo funcionan con la conexión por QR.

**Etiquetas.** Existen solo en cuentas de **WhatsApp Business** (la app verde de empresas). Si tu número es
WhatsApp normal, no hay etiquetas que traer y las del CRM funcionan igual, solo que sin reflejarse en el
teléfono. Con Cloud API tampoco existen: las etiquetas son una función de la app Business.

---

## Estructura

```
prisma/
  schema.prisma        modelos (usuarios, contactos, conversaciones, mensajes, campañas…)
  seed.ts              datos y usuarios de ejemplo
worker/
  whatsapp.mjs         worker Baileys multilínea (una sesión por número)
src/
  app/
    (auth)/login       inicio de sesión
    (app)/inbox        bandeja + hilo + ficha del cliente
    (app)/contactos    clientes, filtros y alta
    (app)/embudo       tablero por etapa
    (app)/productos    catálogo de WooCommerce
    (app)/campanas     mensajes masivos segmentados
    (app)/estados      publicar estados de WhatsApp
    (app)/alertas      avisos y recordatorios
    (app)/automatizaciones  chatbot, automatizaciones, respuestas rápidas
    (app)/ia           base de conocimiento y configuración del asistente
    (app)/panel        métricas
    (app)/actividad    historial del equipo
    (app)/ajustes      canal, marca, equipo, etapas, etiquetas, WooCommerce
    actions/           server actions (auth, inbox, crm, admin, ia)
    api/               webhook de WhatsApp, SSE y cron
  lib/
    channel/           capa de canal intercambiable (baileys | cloud | mock)
    messaging.ts       entrada y salida de mensajes
    ai.ts              asistente (Claude u OpenAI) con contexto del negocio
    bot.ts             motor de reglas del chatbot
    automations.ts     motor de automatizaciones
    campaigns.ts       segmentación y envío por lotes
    woo.ts             cliente de WooCommerce
    history.ts         importación del historial de WhatsApp
    wa-labels.ts       etiquetas de WhatsApp Business en los dos sentidos
    status-posts.ts    estados de WhatsApp y su público
    notifications.ts   alertas, recordatorios y barrido periódico
```

---

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | CRM en desarrollo |
| `npm run wa` | Worker de WhatsApp por QR |
| `npm run build` / `npm start` | Producción |
| `npm run db:migrate` | Aplica migraciones |
| `npm run db:seed` | Borra y recarga datos de ejemplo |
| `npm run db:studio` | Explorador de la base |
| `npm run lint` | ESLint |

---

## Antes de usarlo en producción

1. Cambia `AUTH_SECRET`, `WA_WORKER_SECRET` y `CRON_SECRET` por cadenas largas y aleatorias.
2. Cambia la contraseña de los usuarios de ejemplo o bórralos.
3. Migra a Postgres si van a trabajar varios agentes a la vez: cambia `provider` en `prisma/schema.prisma`,
   ajusta `DATABASE_URL` y corre `npm run db:migrate`.
4. Sirve el CRM por HTTPS (la cookie de sesión se marca `secure` en producción).

## Preparado para crecer

La capa `src/lib/channel/` define un proveedor con `send`, `status`, `connect` y `logout`. Agregar
Instagram, Messenger o Telegram es escribir un proveedor nuevo ahí y un webhook en `src/app/api/webhooks/`;
el inbox, la ficha, la IA y las automatizaciones funcionan igual porque hablan con la conversación, no con
el canal. Lo mismo aplica para Shopify o Mercado Libre frente a `src/lib/woo.ts`.
