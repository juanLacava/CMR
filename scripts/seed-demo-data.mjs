import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const cwd = process.cwd();
const demoMarker = "[demo-seed]";

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split("=", 2);

    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue;
      continue;
    }

    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      args[rawKey] = "true";
      continue;
    }

    args[rawKey] = next;
    index += 1;
  }

  return args;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/u);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

function printHelp() {
  console.log(`Usage:
  npm run seed:demo -- --tenant-slug mi-negocio
  npm run seed:demo -- --tenant-id <uuid>

What it does:
  - loads env vars from .env.local and apps/web/.env.local when present
  - finds an existing tenant by slug or id
  - upserts demo clients and products
  - recreates demo conversations, messages and orders for the tenant
`);
}

async function resolveTenant(supabase, tenantId, tenantSlug) {
  if (!tenantId && !tenantSlug) {
    throw new Error("Pass --tenant-id or --tenant-slug");
  }

  let query = supabase.from("tenants").select("id, name, slug").limit(1);

  if (tenantId) {
    query = query.eq("id", tenantId);
  } else {
    query = query.eq("slug", tenantSlug);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Tenant not found");
  }

  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help === "true" || args.h === "true") {
    printHelp();
    return;
  }

  loadEnvFile(path.join(cwd, ".env.local"));
  loadEnvFile(path.join(cwd, "apps/web/.env.local"));

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const tenant = await resolveTenant(
    supabase,
    args["tenant-id"]?.trim() || null,
    args["tenant-slug"]?.trim() || null
  );

  const now = Date.now();
  const hoursAgo = (hours) => new Date(now - hours * 60 * 60 * 1000).toISOString();

  const demoClients = [
    {
      full_name: "Sofia Ramirez",
      phone: "+5491122334401",
      email: "sofia.demo@example.com",
      origin_channel: "whatsapp",
      tags: ["vip", "recompra", "demo"],
      notes: `${demoMarker} Compra seguido los viernes.`,
      last_interaction_at: hoursAgo(2)
    },
    {
      full_name: "Martin Costa",
      phone: "+5491122334402",
      email: "martin.demo@example.com",
      origin_channel: "instagram",
      tags: ["nuevo", "demo"],
      notes: `${demoMarker} Preguntó por combos.`,
      last_interaction_at: hoursAgo(5)
    },
    {
      full_name: "Valentina Diaz",
      phone: "+5491122334403",
      email: "valentina.demo@example.com",
      origin_channel: "whatsapp",
      tags: ["mayorista", "demo"],
      notes: `${demoMarker} Compra para reventa.`,
      last_interaction_at: hoursAgo(26)
    }
  ];

  const demoProducts = [
    {
      name: "Combo Desayuno",
      sku: "CMR-DEMO-COMBO-DESAYUNO",
      description: "Cafe, croissant y jugo.",
      price: 12500,
      currency: "ARS",
      stock_on_hand: 14,
      stock_reserved: 2,
      stock_minimum: 6,
      is_active: true
    },
    {
      name: "Box Regalo Premium",
      sku: "CMR-DEMO-BOX-PREMIUM",
      description: "Selección premium para regalo.",
      price: 28990,
      currency: "ARS",
      stock_on_hand: 5,
      stock_reserved: 1,
      stock_minimum: 4,
      is_active: true
    },
    {
      name: "Voucher Merienda",
      sku: "CMR-DEMO-VOUCHER-MERIENDA",
      description: "Voucher digital para dos personas.",
      price: 18900,
      currency: "ARS",
      stock_on_hand: 25,
      stock_reserved: 0,
      stock_minimum: 5,
      is_active: true
    }
  ];

  const { data: upsertedClients, error: clientsError } = await supabase
    .from("clients")
    .upsert(
      demoClients.map((client) => ({
        tenant_id: tenant.id,
        ...client
      })),
      { onConflict: "tenant_id,phone" }
    )
    .select("id, full_name, phone");

  if (clientsError) {
    throw clientsError;
  }

  const { data: upsertedProducts, error: productsError } = await supabase
    .from("products")
    .upsert(
      demoProducts.map((product) => ({
        tenant_id: tenant.id,
        ...product
      })),
      { onConflict: "tenant_id,sku" }
    )
    .select("id, name, sku, price, currency");

  if (productsError) {
    throw productsError;
  }

  const { data: existingDemoOrders, error: existingDemoOrdersError } = await supabase
    .from("orders")
    .select("id")
    .eq("tenant_id", tenant.id)
    .like("notes", `%${demoMarker}%`);

  if (existingDemoOrdersError) {
    throw existingDemoOrdersError;
  }

  const demoOrderIds = (existingDemoOrders ?? []).map((order) => order.id);

  if (demoOrderIds.length > 0) {
    const { error: deleteItemsError } = await supabase.from("order_items").delete().in("order_id", demoOrderIds);

    if (deleteItemsError) {
      throw deleteItemsError;
    }

    const { error: deleteOrdersError } = await supabase.from("orders").delete().in("id", demoOrderIds);

    if (deleteOrdersError) {
      throw deleteOrdersError;
    }
  }

  const { error: deleteMessagesError } = await supabase
    .from("messages")
    .delete()
    .eq("tenant_id", tenant.id)
    .like("content", `%${demoMarker}%`);

  if (deleteMessagesError) {
    throw deleteMessagesError;
  }

  const { error: deleteConversationsError } = await supabase
    .from("conversations")
    .delete()
    .eq("tenant_id", tenant.id)
    .like("subject", `%${demoMarker}%`);

  if (deleteConversationsError) {
    throw deleteConversationsError;
  }

  const clientByPhone = new Map(upsertedClients.map((client) => [client.phone, client]));
  const productBySku = new Map(upsertedProducts.map((product) => [product.sku, product]));

  const demoConversationSeeds = [
    {
      clientPhone: "+5491122334401",
      source_conversation_id: "demo-conv-sofia",
      channel: "whatsapp",
      status: "open",
      subject: `${demoMarker} Consulta por reposición`
    },
    {
      clientPhone: "+5491122334402",
      source_conversation_id: "demo-conv-martin",
      channel: "instagram",
      status: "pending",
      subject: `${demoMarker} Consulta por combo regalo`
    }
  ];

  const conversationRows = demoConversationSeeds.map((conversation, index) => {
    const client = clientByPhone.get(conversation.clientPhone);

    if (!client) {
      throw new Error(`Missing demo client ${conversation.clientPhone}`);
    }

    return {
      tenant_id: tenant.id,
      client_id: client.id,
      source: "chatwoot",
      source_conversation_id: conversation.source_conversation_id,
      channel: conversation.channel,
      status: conversation.status,
      subject: conversation.subject,
      last_message_at: hoursAgo(index + 1)
    };
  });

  const { data: conversations, error: conversationsError } = await supabase
    .from("conversations")
    .insert(conversationRows)
    .select("id, client_id, source_conversation_id");

  if (conversationsError) {
    throw conversationsError;
  }

  const conversationBySourceId = new Map(
    conversations.map((conversation) => [conversation.source_conversation_id, conversation])
  );

  const demoMessages = [
    {
      source_message_id: "demo-msg-sofia-1",
      source_conversation_id: "demo-conv-sofia",
      clientPhone: "+5491122334401",
      direction: "inbound",
      content: `${demoMarker} Hola, tienen disponible el combo desayuno para mañana?`,
      sent_at: hoursAgo(2)
    },
    {
      source_message_id: "demo-msg-sofia-2",
      source_conversation_id: "demo-conv-sofia",
      clientPhone: "+5491122334401",
      direction: "outbound",
      content: `${demoMarker} Si, te lo puedo reservar y retirar desde las 9.`,
      sent_at: hoursAgo(1.8)
    },
    {
      source_message_id: "demo-msg-martin-1",
      source_conversation_id: "demo-conv-martin",
      clientPhone: "+5491122334402",
      direction: "inbound",
      content: `${demoMarker} Quiero saber si el box premium viene con tarjeta personalizada.`,
      sent_at: hoursAgo(5)
    }
  ];

  const { error: messagesError } = await supabase
    .from("messages")
    .insert(
      demoMessages.map((message) => {
        const client = clientByPhone.get(message.clientPhone);
        const conversation = conversationBySourceId.get(message.source_conversation_id);

        if (!client || !conversation) {
          throw new Error(`Missing conversation or client for ${message.source_message_id}`);
        }

        return {
          tenant_id: tenant.id,
          conversation_id: conversation.id,
          client_id: client.id,
          source: "chatwoot",
          source_message_id: message.source_message_id,
          direction: message.direction,
          content: message.content,
          content_type: "text",
          metadata: { seeded: true },
          sent_at: message.sent_at
        };
      })
    );

  if (messagesError) {
    throw messagesError;
  }

  const demoOrders = [
    {
      clientPhone: "+5491122334401",
      source_conversation_id: "demo-conv-sofia",
      status: "confirmed",
      notes: `${demoMarker} Pedido confirmado por WhatsApp.`,
      items: [
        { sku: "CMR-DEMO-COMBO-DESAYUNO", quantity: 2 }
      ]
    },
    {
      clientPhone: "+5491122334403",
      source_conversation_id: null,
      status: "draft",
      notes: `${demoMarker} Pedido mayorista en revisión.`,
      items: [
        { sku: "CMR-DEMO-BOX-PREMIUM", quantity: 1 },
        { sku: "CMR-DEMO-VOUCHER-MERIENDA", quantity: 3 }
      ]
    }
  ];

  const createdOrders = [];

  for (const order of demoOrders) {
    const client = clientByPhone.get(order.clientPhone);

    if (!client) {
      throw new Error(`Missing order client ${order.clientPhone}`);
    }

    const totalAmount = order.items.reduce((sum, item) => {
      const product = productBySku.get(item.sku);

      if (!product) {
        throw new Error(`Missing product ${item.sku}`);
      }

      return sum + Number(product.price) * item.quantity;
    }, 0);

    const conversation = order.source_conversation_id
      ? conversationBySourceId.get(order.source_conversation_id)
      : null;

    const { data: createdOrder, error: orderError } = await supabase
      .from("orders")
      .insert({
        tenant_id: tenant.id,
        client_id: client.id,
        conversation_id: conversation?.id ?? null,
        channel: conversation ? "whatsapp" : "manual",
        status: order.status,
        total_amount: totalAmount,
        currency: "ARS",
        notes: order.notes
      })
      .select("id")
      .single();

    if (orderError) {
      throw orderError;
    }

    const orderItems = order.items.map((item) => {
      const product = productBySku.get(item.sku);

      if (!product) {
        throw new Error(`Missing product ${item.sku}`);
      }

      return {
        order_id: createdOrder.id,
        product_id: product.id,
        quantity: item.quantity,
        unit_price: Number(product.price)
      };
    });

    const { error: orderItemsError } = await supabase.from("order_items").insert(orderItems);

    if (orderItemsError) {
      throw orderItemsError;
    }

    createdOrders.push(createdOrder.id);
  }

  console.log(
    JSON.stringify(
      {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        clients: upsertedClients.length,
        products: upsertedProducts.length,
        conversations: conversations.length,
        orders: createdOrders.length
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
