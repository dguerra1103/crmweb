import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const STAGES = [
  { name: "Nuevo", color: "#64748b", order: 0 },
  { name: "Interesado", color: "#0ea5e9", order: 1 },
  { name: "Cotización", color: "#6366f1", order: 2 },
  { name: "Pago pendiente", color: "#f59e0b", order: 3 },
  { name: "Cliente", color: "#10b981", order: 4, isWon: true },
  { name: "Seguimiento", color: "#8b5cf6", order: 5 },
];

const TAGS = [
  { name: "Mayorista", color: "#0ea5e9" },
  { name: "Urgente", color: "#ef4444" },
  { name: "Recompra", color: "#10b981" },
  { name: "Frío", color: "#94a3b8" },
];

function minutesAgo(min: number) {
  return new Date(Date.now() - min * 60 * 1000);
}

async function main() {
  await prisma.campaignRecipient.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.note.deleteMany();
  await prisma.task.deleteMany();
  await prisma.contactTag.deleteMany();
  await prisma.order.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.stage.deleteMany();
  await prisma.user.deleteMany();
  await prisma.quickReply.deleteMany();
  await prisma.botRule.deleteMany();
  await prisma.automation.deleteMany();
  await prisma.knowledge.deleteMany();

  const password = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.create({
    data: { name: "Administrador", email: "admin@crm.com", passwordHash: password, role: "admin", color: "#0f766e" },
  });
  const supervisor = await prisma.user.create({
    data: { name: "Ana Supervisora", email: "ana@crm.com", passwordHash: password, role: "supervisor", color: "#1d4ed8" },
  });
  const agent = await prisma.user.create({
    data: { name: "Luis Agente", email: "luis@crm.com", passwordHash: password, role: "agent", color: "#b91c1c" },
  });

  const stages = [];
  for (const stage of STAGES) stages.push(await prisma.stage.create({ data: stage }));

  const tags = [];
  for (const tag of TAGS) tags.push(await prisma.tag.create({ data: tag }));

  await prisma.quickReply.createMany({
    data: [
      {
        shortcut: "/saludo",
        title: "Saludo inicial",
        body: "¡Hola! 👋 Gracias por escribirnos. ¿En qué te puedo ayudar hoy?",
        category: "general",
      },
      {
        shortcut: "/precio",
        title: "Enviar precio",
        body: "El precio es {{precio}} con envío incluido. ¿Te lo aparto?",
        category: "ventas",
      },
      {
        shortcut: "/pago",
        title: "Datos de pago",
        body: "Puedes pagar por Nequi, Daviplata o transferencia. Apenas envíes el comprobante despachamos. 🙌",
        category: "ventas",
      },
      {
        shortcut: "/envio",
        title: "Tiempos de envío",
        body: "Los envíos llegan en 1 a 3 días hábiles a todo el país. Te paso la guía apenas salga. 📦",
        category: "soporte",
      },
      {
        shortcut: "/gracias",
        title: "Cierre",
        body: "¡Gracias por tu compra! Cualquier cosa quedo atento por aquí. 💚",
        category: "general",
      },
    ],
  });

  await prisma.botRule.createMany({
    data: [
      {
        name: "Bienvenida",
        match: "welcome",
        keywords: "",
        reply: "¡Hola! 👋 Gracias por escribirnos. Cuéntame qué producto te interesa y te ayudo enseguida.",
        priority: 100,
      },
      {
        name: "Consulta de precio",
        match: "contains",
        keywords: "precio, cuanto cuesta, cuánto vale, valor",
        reply: "Con gusto te paso precios. ¿Qué producto exactamente estás buscando?",
        priority: 50,
      },
      {
        name: "Horario",
        match: "contains",
        keywords: "horario, atienden, abierto",
        reply: "Atendemos de lunes a sábado, 8:00 a.m. a 8:00 p.m. 🕗",
        priority: 40,
      },
    ],
  });

  await prisma.knowledge.createMany({
    data: [
      {
        kind: "policy",
        title: "Envíos y entregas",
        content:
          "Envíos a todo el país en 1 a 3 días hábiles. Envío gratis por compras superiores a $150.000. Se entrega guía de rastreo el mismo día del despacho.",
        keywords: "envío, entrega, guía, domicilio",
      },
      {
        kind: "policy",
        title: "Medios de pago",
        content:
          "Aceptamos Nequi, Daviplata, transferencia bancaria y pago contra entrega en ciudades principales. No manejamos cuotas ni financiación.",
        keywords: "pago, nequi, daviplata, transferencia, contra entrega",
      },
      {
        kind: "faq",
        title: "Garantía",
        content:
          "Todos los productos tienen 30 días de garantía por defectos de fábrica. No cubre daño por mal uso. El cliente envía foto o video del defecto para tramitarla.",
        keywords: "garantía, devolución, defecto, cambio",
      },
      {
        kind: "faq",
        title: "Horario de atención",
        content: "Lunes a sábado de 8:00 a.m. a 8:00 p.m. Domingos y festivos no hay despachos.",
        keywords: "horario, atención, domingo",
      },
    ],
  });

  await prisma.automation.create({
    data: {
      name: "Seguimiento si el cliente no responde",
      trigger: "no_reply",
      conditions: JSON.stringify({}),
      actions: JSON.stringify([
        { type: "send_message", value: "Hola {{nombre}}, ¿seguimos con tu pedido? Quedo atento 😊" },
        { type: "set_status", value: "pending" },
      ]),
    },
  });

  await prisma.automation.create({
    data: {
      name: "Etiquetar interesados en mayoreo",
      trigger: "message_received",
      conditions: JSON.stringify({ keywords: "mayorista, por mayor, cantidad" }),
      actions: JSON.stringify([
        { type: "add_tag", value: tags[0].id },
        { type: "create_task", value: "Enviar lista de precios mayoristas" },
      ]),
    },
  });

  const contactsData = [
    {
      name: "María Gómez",
      phone: "573001112233",
      email: "maria@gmail.com",
      stageId: stages[3].id,
      ownerId: agent.id,
      totalSpent: 480000,
      ordersCount: 3,
      lastOrderAt: minutesAgo(60 * 24 * 5),
      isFavorite: true,
    },
    {
      name: "Carlos Rueda",
      phone: "573104445566",
      stageId: stages[1].id,
      ownerId: agent.id,
      totalSpent: 0,
      ordersCount: 0,
    },
    {
      name: "Laura Peña",
      phone: "573207778899",
      stageId: stages[4].id,
      ownerId: supervisor.id,
      totalSpent: 1250000,
      ordersCount: 7,
      lastOrderAt: minutesAgo(60 * 20),
    },
    { name: "Jorge Ramírez", phone: "573155554433", stageId: stages[0].id },
    { name: "Diana Torres", phone: "573183332211", stageId: stages[2].id, ownerId: agent.id },
  ];

  const contacts = [];
  for (const data of contactsData) contacts.push(await prisma.contact.create({ data }));

  await prisma.contactTag.createMany({
    data: [
      { contactId: contacts[0].id, tagId: tags[2].id },
      { contactId: contacts[1].id, tagId: tags[0].id },
      { contactId: contacts[2].id, tagId: tags[2].id },
      { contactId: contacts[3].id, tagId: tags[3].id },
      { contactId: contacts[4].id, tagId: tags[1].id },
    ],
  });

  const threads: { contactIndex: number; assigned?: string; unread: number; ai: boolean; messages: [string, string][] }[] =
    [
      {
        contactIndex: 0,
        assigned: agent.id,
        unread: 2,
        ai: false,
        messages: [
          ["in", "Hola, buenas tardes 👋"],
          ["out", "¡Hola María! Gracias por escribirnos, ¿en qué te ayudo?"],
          ["in", "Quiero saber si tienen el combo que vi en la página"],
          ["out", "Sí, lo tenemos disponible. Cuesta $180.000 con envío incluido."],
          ["in", "Perfecto, ¿cómo hago el pago?"],
          ["in", "¿Aceptan Nequi?"],
        ],
      },
      {
        contactIndex: 1,
        unread: 1,
        ai: true,
        messages: [
          ["in", "Buenas, manejan precios por mayor?"],
          ["out", "¡Hola! Sí manejamos precios especiales desde 10 unidades. ¿Qué producto te interesa?"],
          ["in", "El pack de 3, cuánto sale por 20 unidades"],
        ],
      },
      {
        contactIndex: 2,
        assigned: supervisor.id,
        unread: 0,
        ai: false,
        messages: [
          ["in", "Ya me llegó el pedido, quedó perfecto 🙌"],
          ["out", "¡Qué alegría, Laura! Gracias por confiar en nosotros. Cualquier cosa aquí estamos 💚"],
        ],
      },
      {
        contactIndex: 3,
        unread: 1,
        ai: false,
        messages: [["in", "Hola, información por favor"]],
      },
      {
        contactIndex: 4,
        assigned: agent.id,
        unread: 0,
        ai: false,
        messages: [
          ["in", "Necesito una cotización para 5 unidades"],
          ["out", "Claro que sí, Diana. Te la envío en unos minutos con el descuento aplicado."],
        ],
      },
    ];

  for (const [index, thread] of threads.entries()) {
    const contact = contacts[thread.contactIndex];
    const conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        assignedToId: thread.assigned ?? null,
        unreadCount: thread.unread,
        aiEnabled: thread.ai,
        status: thread.unread > 0 ? "open" : "closed",
        isFavorite: index === 0,
        lastMessage: thread.messages[thread.messages.length - 1][1],
        lastMessageAt: minutesAgo(index * 37 + 4),
      },
    });

    for (const [offset, [direction, body]] of thread.messages.entries()) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction,
          body,
          status: direction === "out" ? "read" : "delivered",
          senderUserId: direction === "out" ? (thread.assigned ?? admin.id) : null,
          createdAt: minutesAgo(index * 37 + (thread.messages.length - offset) * 6),
        },
      });
    }
  }

  await prisma.note.createMany({
    data: [
      { contactId: contacts[0].id, authorId: agent.id, body: "Pidió descuento por pago anticipado. Ofrecer 5%.", pinned: true },
      { contactId: contacts[1].id, authorId: agent.id, body: "Tiene tienda física en Medellín, potencial mayorista." },
      { contactId: contacts[2].id, authorId: supervisor.id, body: "Cliente frecuente, siempre paga por Nequi." },
    ],
  });

  await prisma.task.createMany({
    data: [
      {
        title: "Enviar datos de pago a María",
        dueAt: minutesAgo(-60),
        priority: "high",
        contactId: contacts[0].id,
        assignedToId: agent.id,
        createdById: admin.id,
      },
      {
        title: "Cotización mayorista para Carlos",
        dueAt: minutesAgo(-60 * 24),
        priority: "medium",
        contactId: contacts[1].id,
        assignedToId: agent.id,
      },
      {
        title: "Llamar a Diana para cerrar",
        dueAt: minutesAgo(60 * 24),
        priority: "high",
        contactId: contacts[4].id,
        assignedToId: supervisor.id,
      },
    ],
  });

  await prisma.activity.createMany({
    data: [
      { userId: agent.id, action: "message.sent", summary: "Envió un mensaje a María Gómez" },
      { userId: supervisor.id, action: "contact.stage", summary: "Movió a Laura Peña a Cliente" },
      { userId: admin.id, action: "settings.updated", summary: "Actualizó la configuración del canal" },
    ],
  });

  await prisma.setting.upsert({
    where: { key: "brand" },
    create: {
      key: "brand",
      value: JSON.stringify({ name: "Mi Negocio", tagline: "Ventas y atención por WhatsApp" }),
    },
    update: {},
  });

  console.log("Datos de ejemplo cargados.");
  console.log("Usuarios: admin@crm.com / ana@crm.com / luis@crm.com — contraseña: admin123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
