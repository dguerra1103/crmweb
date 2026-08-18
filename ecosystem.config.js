/**
 * Configuración de PM2: mantiene el CRM y el worker de WhatsApp corriendo
 * 24/7 en el VPS, con reinicio automático si se caen.
 *
 * Lee el .env al arrancar y pasa las variables a ambos procesos. De esta
 * forma el worker ESM no depende de que dotenv funcione en runtime.
 *
 * Uso:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup   (una sola vez, para que arranque solo al reiniciar el servidor)
 *
 * Tras editar el .env:
 *   pm2 delete all && pm2 start ecosystem.config.js && pm2 save
 */
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return {};
  const vars = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

const dotenvVars = loadEnv();

module.exports = {
  apps: [
    {
      // Puerto 3001: en VPS con EasyPanel, el 3000 lo usa el propio panel.
      name: "crm-web",
      script: "npm",
      args: "start",
      cwd: __dirname,
      env: { NODE_ENV: "production", PORT: "3001", ...dotenvVars },
      max_memory_restart: "500M",
    },
    {
      name: "crm-wa",
      script: "worker/whatsapp.mjs",
      cwd: __dirname,
      env: { NODE_ENV: "production", ...dotenvVars },
      max_memory_restart: "300M",
    },
  ],
};
