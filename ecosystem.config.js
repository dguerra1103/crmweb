/**
 * Configuración de PM2: mantiene el CRM y el worker de WhatsApp corriendo
 * 24/7 en el VPS, con reinicio automático si se caen.
 *
 * Uso:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup   (una sola vez, para que arranque solo al reiniciar el servidor)
 */
module.exports = {
  apps: [
    {
      // Puerto 3001: en VPS con EasyPanel, el 3000 lo usa el propio panel.
      name: "crm-web",
      script: "npm",
      args: "start",
      cwd: __dirname,
      env: { NODE_ENV: "production", PORT: "3001" },
      max_memory_restart: "500M",
    },
    {
      name: "crm-wa",
      script: "worker/whatsapp.mjs",
      cwd: __dirname,
      env: { NODE_ENV: "production" },
      max_memory_restart: "300M",
    },
  ],
};
