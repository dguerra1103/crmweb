/**
 * Worker de WhatsApp por QR (Baileys) — multilínea.
 *
 * Corre como proceso aparte del CRM:  npm run wa
 * - Mantiene una sesión por línea de WhatsApp (carpeta .wa-auth/<sesión>).
 * - Expone una API HTTP local: estado/QR, enviar, etiquetas, estados, desconectar.
 * - Reenvía al CRM los mensajes entrantes, el historial y las etiquetas de WhatsApp Business.
 *
 * Cada línea es un número distinto: si envías masivamente, Meta puede bloquearlo
 * (esta es una integración no oficial).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import pino from "pino";
import dotenv from "dotenv";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// A diferencia del CRM (Next.js carga .env solo), este script corre suelto
// con "node worker/whatsapp.mjs" — sin esto, WA_WORKER_SECRET y el resto
// del .env nunca llegan y el worker cae a valores por defecto, causando
// un 401 "secreto inválido" al no coincidir con lo que manda el CRM.
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const AUTH_ROOT = path.join(__dirname, "..", ".wa-auth");
const PORT = Number(process.env.WA_WORKER_PORT || 4001);
const SECRET = process.env.WA_WORKER_SECRET || "dev-worker-secret";
const CRM_URL = (process.env.CRM_URL || "http://localhost:3000").replace(/\/$/, "");
/** Cuántos mensajes se mandan al CRM por lote de historial. */
const HISTORY_CHUNK = 300;

const logger = pino({ level: process.env.WA_LOG_LEVEL || "warn" });

/** Una entrada por línea de WhatsApp. */
const sessions = new Map();

function safeSessionId(value) {
  return String(value || "principal")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40) || "principal";
}

function getSession(rawId) {
  const id = safeSessionId(rawId);
  if (!sessions.has(id)) {
    sessions.set(id, {
      id,
      sock: null,
      connected: false,
      qrDataUrl: null,
      phone: null,
      detail: "Sin iniciar. Pulsa Conectar en Ajustes → Líneas de WhatsApp.",
      starting: false,
      history: { status: "idle", progress: 0, messages: 0, chats: 0 },
      labels: 0,
      /** Mapa teléfono → JID real (soporta @lid y @s.whatsapp.net). */
      phoneJids: new Map(),
    });
  }
  return sessions.get(id);
}

function jidToPhone(jid = "") {
  return jid.split("@")[0].split(":")[0].replace(/\D/g, "");
}

function isLid(jid = "") {
  return jid.endsWith("@lid");
}

function isPersonalChat(jid = "") {
  return Boolean(jid) && !jid.endsWith("@g.us") && jid !== "status@broadcast" && !jid.endsWith("@newsletter");
}

/**
 * Resuelve el teléfono real de un JID, manejando LIDs (identificador interno
 * que WhatsApp usa para dispositivos vinculados — @lid, NO es un teléfono).
 *
 * Orden de intentos:
 * 1. msg.key.remoteJidAlt: WhatsApp manda el JID real (@s.whatsapp.net)
 *    junto con el @lid directo en el mensaje. Es lo más confiable y no
 *    hace ninguna llamada extra.
 * 2. sock.signalRepository.lidMapping.getPNForLID(): el mapa lid↔teléfono
 *    que Baileys sincroniza internamente (API correcta — `onWhatsApp()`
 *    NO sirve para esto, espera números reales, no LIDs).
 * 3. Último recurso: los dígitos del propio LID. No es un teléfono real;
 *    solo evita romper el flujo si las dos anteriores fallan.
 */
async function resolvePhone(sock, jid, msg) {
  // JID normal: el teléfono ya es el número real.
  if (!isLid(jid)) return jidToPhone(jid);

  const alt = msg?.key?.remoteJidAlt;
  if (alt && !isLid(alt)) return jidToPhone(alt);

  try {
    const pn = await sock.signalRepository?.lidMapping?.getPNForLID(jid);
    if (pn) return jidToPhone(pn);
  } catch (e) {
    console.log(`[wa] No se pudo resolver LID ${jid} vía lidMapping: ${e.message}`);
  }

  console.log(`[wa] ⚠ No se pudo resolver el teléfono real de ${jid}; usando los dígitos del LID (puede ser incorrecto).`);
  return jidToPhone(jid);
}

function extractContent(message) {
  if (!message) return null;
  if (message.conversation) return { type: "text", text: message.conversation };
  if (message.extendedTextMessage?.text) return { type: "text", text: message.extendedTextMessage.text };
  if (message.imageMessage) return { type: "image", text: message.imageMessage.caption || "" };
  if (message.videoMessage) return { type: "video", text: message.videoMessage.caption || "" };
  if (message.documentMessage) {
    return { type: "document", text: message.documentMessage.fileName || "documento" };
  }
  if (message.audioMessage) return { type: "audio", text: "" };
  if (message.stickerMessage) return { type: "image", text: "" };
  if (message.ephemeralMessage) return extractContent(message.ephemeralMessage.message);
  if (message.viewOnceMessageV2) return extractContent(message.viewOnceMessageV2.message);
  if (message.viewOnceMessage) return extractContent(message.viewOnceMessage.message);
  return null;
}

async function postToCrm(pathname, payload) {
  try {
    console.log(`[wa] → CRM POST ${CRM_URL}${pathname}`);
    const res = await fetch(`${CRM_URL}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-worker-secret": SECRET },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[wa] ✗ CRM ${pathname} respondió ${res.status}: ${text}`);
      return null;
    }
    const json = await res.json();
    console.log(`[wa] ✓ CRM ${pathname} → ok`);
    return json;
  } catch (error) {
    console.error(`[wa] ✗ No se pudo hablar con el CRM (${pathname}): ${error.message}`);
    return null;
  }
}

/* ---------------- Historial ---------------- */

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function sendHistory(session, { chats = [], messages = [], progress, isLatest }) {
  const cleanChats = chats
    .filter((chat) => isPersonalChat(chat.id))
    .map((chat) => ({
      phone: jidToPhone(chat.id),
      name: chat.name || undefined,
      unread: chat.unreadCount ?? 0,
      archived: Boolean(chat.archived),
    }));

  const cleanMessages = messages
    .filter((msg) => isPersonalChat(msg.key?.remoteJid) && msg.key?.id)
    .map((msg) => {
      const content = extractContent(msg.message);
      if (!content) return null;
      return {
        externalId: msg.key.id,
        phone: jidToPhone(msg.key.remoteJid),
        name: msg.pushName || undefined,
        fromMe: Boolean(msg.key.fromMe),
        text: content.text,
        type: content.type,
        timestamp: Number(msg.messageTimestamp?.low ?? msg.messageTimestamp ?? 0) || Math.floor(Date.now() / 1000),
      };
    })
    .filter(Boolean);

  session.history.status = isLatest ? "complete" : "running";
  session.history.progress = Math.round(progress ?? session.history.progress);

  if (cleanChats.length === 0 && cleanMessages.length === 0) return;

  const batches = chunk(cleanMessages, HISTORY_CHUNK);
  if (batches.length === 0) batches.push([]);

  for (const [index, batch] of batches.entries()) {
    const result = await postToCrm("/api/webhooks/whatsapp/history", {
      session: session.id,
      chats: index === 0 ? cleanChats : [],
      messages: batch,
      progress: session.history.progress,
      isLatest: Boolean(isLatest) && index === batches.length - 1,
    });
    if (result) {
      session.history.messages += result.messagesImported ?? 0;
      session.history.chats += result.conversationsCreated ?? 0;
    }
  }

  console.log(
    `[wa:${session.id}] Historial: ${session.history.messages} mensajes y ${session.history.chats} chats (${session.history.progress}%)`,
  );
}

/* ---------------- Socket por línea ---------------- */

async function startSocket(sessionId) {
  const session = getSession(sessionId);
  if (session.starting) return session;
  session.starting = true;
  session.detail = "Conectando con WhatsApp…";

  const authDir = path.join(AUTH_ROOT, session.id);
  fs.mkdirSync(authDir, { recursive: true });
  const { state: authState, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: authState,
    logger,
    markOnlineOnConnect: false,
    // Trae el historial que el teléfono comparte al vincular el dispositivo.
    syncFullHistory: true,
    browser: ["CRM WhatsApp", "Chrome", "1.0.0"],
  });
  session.sock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      session.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
      session.connected = false;
      session.detail = "Escanea el código QR con WhatsApp → Dispositivos vinculados.";
      console.log(`[wa:${session.id}] Nuevo QR disponible en el CRM.`);
    }

    if (connection === "open") {
      session.connected = true;
      session.qrDataUrl = null;
      session.phone = jidToPhone(sock.user?.id || "");
      session.detail = `Conectado como +${session.phone}`;
      session.starting = false;
      console.log(`[wa:${session.id}] Conectado como +${session.phone}`);
      await postToCrm("/api/webhooks/whatsapp/line", { session: session.id, phone: session.phone });
    }

    if (connection === "close") {
      session.connected = false;
      session.starting = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      session.detail = loggedOut
        ? "Sesión cerrada desde el teléfono. Vuelve a conectar y escanea el QR."
        : "Conexión perdida, reintentando…";
      console.log(
        `[wa:${session.id}] Conexión cerrada (${code ?? "sin código"}). ${loggedOut ? "Requiere QR." : "Reintento en 3s."}`,
      );
      if (!loggedOut) setTimeout(() => startSocket(session.id).catch((e) => logger.error(e)), 3000);
      else session.qrDataUrl = null;
    }
  });

  sock.ev.on("messaging-history.set", async ({ chats, messages, progress, isLatest }) => {
    await sendHistory(session, { chats: chats ?? [], messages: messages ?? [], progress, isLatest });
  });

  sock.ev.on("messaging-history.status", async ({ status }) => {
    if (status !== "complete") return;
    session.history.status = "complete";
    session.history.progress = 100;
    await postToCrm("/api/webhooks/whatsapp/history", { session: session.id, done: true });
    console.log(`[wa:${session.id}] Sincronización de historial terminada.`);
  });

  sock.ev.on("labels.edit", async (label) => {
    session.labels++;
    await postToCrm("/api/webhooks/whatsapp/labels", {
      session: session.id,
      kind: "label",
      label: { id: label.id, name: label.name, color: label.color, deleted: label.deleted },
    });
    console.log(`[wa:${session.id}] Etiqueta sincronizada: ${label.name ?? label.id}${label.deleted ? " (borrada)" : ""}`);
  });

  sock.ev.on("labels.association", async ({ association, type }) => {
    if (!association?.chatId || !isPersonalChat(association.chatId)) return;
    await postToCrm("/api/webhooks/whatsapp/labels", {
      session: session.id,
      kind: "association",
      phone: jidToPhone(association.chatId),
      labelId: association.labelId,
      type,
    });
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    console.log(`[wa:${session.id}] messages.upsert: type=${type}, count=${messages.length}`);
    if (type !== "notify") return;

    for (const msg of messages) {
      const jid = msg.key?.remoteJid ?? "";
      const fromMe = Boolean(msg.key?.fromMe);
      const personal = isPersonalChat(jid);
      console.log(`[wa:${session.id}] msg: jid=${jid}, fromMe=${fromMe}, personal=${personal}`);
      if (!personal) continue;

      const content = extractContent(msg.message);
      if (!content) {
        console.log(`[wa:${session.id}] msg ignorado: sin contenido extraíble`);
        continue;
      }

      // Resolver el teléfono real (necesario para JIDs @lid).
      const phone = await resolvePhone(sock, jid, msg);
      // Guardar el mapeo teléfono → JID para poder responder al JID correcto.
      session.phoneJids.set(phone, jid);
      console.log(
        `[wa:${session.id}] ${fromMe ? "→ (tú, desde el teléfono)" : "← Mensaje entrante"} de +${phone} (jid=${jid}): "${content.text?.slice(0, 50)}" (${content.type})`,
      );

      // Si lo mandó el propio CRM, el worker recibe el eco con el mismo
      // externalId — el CRM lo descarta solo (deduplicación por externalId),
      // así que no hace falta filtrarlo aquí.
      await postToCrm("/api/webhooks/whatsapp", {
        session: session.id,
        phone,
        name: msg.pushName || undefined,
        text: content.text,
        type: content.type,
        externalId: msg.key.id,
        fromMe,
      });
    }
  });

  session.starting = false;
  return session;
}

/* ---------------- API local para el CRM ---------------- */

function send(res, status, data) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (piece) => {
      raw += piece;
      if (raw.length > 5_000_000) reject(new Error("cuerpo demasiado grande"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("JSON inválido"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Construye el JID para enviar un mensaje.
 * Busca primero en el mapa de JIDs de la sesión (que incluye @lid),
 * y si no lo encuentra, usa el formato estándar @s.whatsapp.net.
 */
function toJid(phone, session) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  // Buscar en el mapa de la sesión: puede ser un @lid.
  if (session?.phoneJids?.has(digits)) {
    const mapped = session.phoneJids.get(digits);
    console.log(`[wa:${session.id}] JID mapeado: ${digits} → ${mapped}`);
    return mapped;
  }
  return `${digits}@s.whatsapp.net`;
}

const server = http.createServer(async (req, res) => {
  if (req.headers["x-worker-secret"] !== SECRET) return send(res, 401, { error: "secreto inválido" });

  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (req.method === "GET" && url.pathname === "/status") {
      const session = getSession(url.searchParams.get("session"));
      return send(res, 200, {
        session: session.id,
        connected: session.connected,
        qr: session.qrDataUrl,
        phone: session.phone,
        detail: session.detail,
        history: session.history,
        labels: session.labels,
      });
    }

    if (req.method === "GET" && url.pathname === "/sessions") {
      return send(res, 200, {
        sessions: [...sessions.values()].map((s) => ({
          session: s.id,
          connected: s.connected,
          phone: s.phone,
          detail: s.detail,
        })),
      });
    }

    const body = req.method === "POST" ? await readBody(req) : {};
    const session = getSession(body.session ?? url.searchParams.get("session"));

    if (req.method === "POST" && url.pathname === "/connect") {
      if (session.connected) return send(res, 200, { ok: true, detail: "Esta línea ya está conectada." });
      await startSocket(session.id);
      return send(res, 200, { ok: true, detail: "Generando código QR…" });
    }

    if (req.method === "POST" && url.pathname === "/logout") {
      try {
        await session.sock?.logout();
      } catch {
        // la sesión ya podía estar caída
      }
      session.sock = null;
      session.connected = false;
      session.qrDataUrl = null;
      session.phone = null;
      session.detail = "Sesión cerrada.";
      session.history = { status: "idle", progress: 0, messages: 0, chats: 0 };
      fs.rmSync(path.join(AUTH_ROOT, session.id), { recursive: true, force: true });
      return send(res, 200, { ok: true, detail: "Sesión cerrada y credenciales borradas." });
    }

    if (!session.sock || !session.connected) {
      if (["/send", "/label", "/status-post"].includes(url.pathname)) {
        return send(res, 200, { ok: false, error: `La línea "${session.id}" no está conectada.` });
      }
    }

    if (req.method === "POST" && url.pathname === "/label") {
      const jid = toJid(body.phone);
      const labelId = String(body.labelId || "");
      if (!jid || !labelId) return send(res, 200, { ok: false, error: "Faltan teléfono o etiqueta." });
      try {
        if (body.action === "remove") await session.sock.removeChatLabel(jid, labelId);
        else await session.sock.addChatLabel(jid, labelId);
        return send(res, 200, { ok: true });
      } catch (error) {
        // Las etiquetas solo existen en cuentas de WhatsApp Business.
        return send(res, 200, { ok: false, error: error.message });
      }
    }

    /** Publica un estado de WhatsApp visible para los contactos indicados. */
    if (req.method === "POST" && url.pathname === "/status-post") {
      const recipients = (Array.isArray(body.recipients) ? body.recipients : [])
        .map(toJid)
        .filter(Boolean);
      if (recipients.length === 0) return send(res, 200, { ok: false, error: "Sin destinatarios." });

      const content = body.mediaUrl
        ? { image: { url: body.mediaUrl }, caption: body.text || "" }
        : { text: body.text || "" };

      try {
        const sent = await session.sock.sendMessage("status@broadcast", content, {
          backgroundColor: body.background || "#0f766e",
          font: 1,
          statusJidList: recipients,
        });
        return send(res, 200, { ok: true, externalId: sent?.key?.id, recipients: recipients.length });
      } catch (error) {
        return send(res, 200, { ok: false, error: error.message });
      }
    }

    if (req.method === "POST" && url.pathname === "/send") {
      const jid = toJid(body.to, session);
      console.log(`[wa:${session.id}] → Enviar a ${jid}: "${(body.text || "").slice(0, 50)}"`);
      if (!jid) return send(res, 200, { ok: false, error: "Teléfono inválido." });

      let payload;
      if (body.mediaUrl) {
        const kind = body.mediaType || "image";
        payload =
          kind === "document"
            ? { document: { url: body.mediaUrl }, fileName: body.fileName || "archivo", caption: body.text || "" }
            : kind === "video"
              ? { video: { url: body.mediaUrl }, caption: body.text || "" }
              : kind === "audio"
                ? { audio: { url: body.mediaUrl } }
                : { image: { url: body.mediaUrl }, caption: body.text || "" };
      } else {
        payload = { text: body.text || "" };
      }

      const sent = await session.sock.sendMessage(jid, payload);
      console.log(`[wa:${session.id}] ✓ Enviado, id=${sent?.key?.id}`);
      return send(res, 200, { ok: true, externalId: sent?.key?.id });
    }

    return send(res, 404, { error: "ruta no encontrada" });
  } catch (error) {
    return send(res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`[wa] Worker escuchando en http://localhost:${PORT}`);
  console.log(`[wa] CRM: ${CRM_URL}`);

  // Reconecta las líneas que ya tenían sesión guardada.
  if (fs.existsSync(AUTH_ROOT)) {
    for (const dir of fs.readdirSync(AUTH_ROOT)) {
      if (!fs.existsSync(path.join(AUTH_ROOT, dir, "creds.json"))) continue;
      console.log(`[wa:${dir}] Sesión previa encontrada, reconectando…`);
      startSocket(dir).catch((error) => console.error(`[wa:${dir}] Error al conectar:`, error.message));
    }
  }
  console.log('[wa] Líneas nuevas: pulsa "Conectar" en Ajustes → Líneas de WhatsApp.');
});
