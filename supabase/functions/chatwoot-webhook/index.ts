import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type ChatwootContact = {
  id?: number;
  name?: string;
  phone_number?: string;
  email?: string;
};

type ChatwootConversation = {
  id?: number;
  status?: string;
  inbox_id?: number;
  meta?: {
    sender?: {
      phone_number?: string;
      name?: string;
    };
    assignee?: {
      name?: string;
    };
  };
};

type ChatwootMessage = {
  id?: number;
  content?: string;
  content_type?: string;
  created_at?: number;
  message_type?: number;
  source_id?: string;
};

type ChatwootWebhookPayload = {
  event?: string;
  account?: {
    id?: number;
    name?: string;
  };
  id?: number;
  content?: string;
  message_type?: number;
  content_type?: string;
  conversation?: ChatwootConversation;
  contact?: ChatwootContact;
  sender?: ChatwootContact;
  messages?: ChatwootMessage[];
  additional_attributes?: Record<string, Json>;
};

function jsonResponse(status: number, body: Record<string, Json>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

function normalizePhone(payload: ChatwootWebhookPayload) {
  const rawPhone =
    payload.contact?.phone_number ??
    payload.sender?.phone_number ??
    payload.conversation?.meta?.sender?.phone_number;

  return rawPhone?.trim() ?? "";
}

function normalizeName(payload: ChatwootWebhookPayload) {
  return (
    payload.contact?.name ??
    payload.sender?.name ??
    payload.conversation?.meta?.sender?.name ??
    "Cliente sin nombre"
  );
}

function normalizeDirection(messageType?: number) {
  return messageType === 0 ? "inbound" : "outbound";
}

function normalizeConversationStatus(status?: string) {
  if (status === "resolved") {
    return "resolved";
  }

  if (status === "pending") {
    return "pending";
  }

  return "open";
}

function resolveSentAt(payload: ChatwootWebhookPayload) {
  const createdAt =
    payload.messages?.[0]?.created_at ??
    payload.additional_attributes?.created_at;

  if (typeof createdAt === "number") {
    return new Date(createdAt * 1000).toISOString();
  }

  return new Date().toISOString();
}

function resolveMessageSourceId(payload: ChatwootWebhookPayload) {
  return (
    payload.messages?.[0]?.source_id ??
    payload.messages?.[0]?.id?.toString() ??
    payload.id?.toString() ??
    crypto.randomUUID()
  );
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

async function ensureClient(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  payload: ChatwootWebhookPayload
) {
  const phone = normalizePhone(payload);

  if (!phone) {
    throw new Error("Chatwoot payload without phone_number");
  }

  const clientPayload = {
    tenant_id: tenantId,
    phone,
    full_name: normalizeName(payload),
    email: payload.contact?.email ?? payload.sender?.email ?? null,
    origin_channel: "whatsapp",
    last_interaction_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("clients")
    .upsert(clientPayload, {
      onConflict: "tenant_id,phone"
    })
    .select("id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Failed to upsert client");
  }

  return data.id;
}

async function ensureConversation(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  clientId: string,
  payload: ChatwootWebhookPayload
) {
  const sourceConversationId = payload.conversation?.id?.toString();

  if (!sourceConversationId) {
    throw new Error("Chatwoot payload without conversation id");
  }

  const conversationPayload = {
    tenant_id: tenantId,
    client_id: clientId,
    source: "chatwoot",
    source_conversation_id: sourceConversationId,
    channel: "whatsapp",
    status: normalizeConversationStatus(payload.conversation?.status),
    assigned_to: payload.conversation?.meta?.assignee?.name ?? null,
    last_message_at: resolveSentAt(payload)
  };

  const { data, error } = await supabase
    .from("conversations")
    .upsert(conversationPayload, {
      onConflict: "tenant_id,source,source_conversation_id"
    })
    .select("id")
    .single();

  if (error || !data) {
    throw error ?? new Error("Failed to upsert conversation");
  }

  return data.id;
}

async function insertMessage(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  clientId: string,
  conversationId: string,
  payload: ChatwootWebhookPayload
) {
  const content = payload.content ?? payload.messages?.[0]?.content ?? "";

  if (!content.trim()) {
    return;
  }

  const messagePayload = {
    tenant_id: tenantId,
    client_id: clientId,
    conversation_id: conversationId,
    source: "chatwoot",
    source_message_id: resolveMessageSourceId(payload),
    direction: normalizeDirection(payload.message_type ?? payload.messages?.[0]?.message_type),
    content,
    content_type: payload.content_type ?? payload.messages?.[0]?.content_type ?? "text",
    metadata: {
      chatwoot_event: payload.event ?? null,
      account_id: payload.account?.id ?? null,
      conversation_id: payload.conversation?.id ?? null,
      inbox_id: payload.conversation?.inbox_id ?? null
    },
    sent_at: resolveSentAt(payload)
  };

  const { error } = await supabase.from("messages").upsert(messagePayload, {
    onConflict: "tenant_id,source,source_message_id"
  });

  if (error) {
    throw error;
  }
}

async function ensureDraftOrder(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  clientId: string,
  conversationId: string,
  payload: ChatwootWebhookPayload
) {
  const content = (payload.content ?? payload.messages?.[0]?.content ?? "").toLowerCase();
  const shouldCreateDraft = ["precio", "comprar", "quiero", "stock", "pedido"].some((token) =>
    content.includes(token)
  );

  if (!shouldCreateDraft) {
    return;
  }

  const { data: existingOrder, error: existingOrderError } = await supabase
    .from("orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .in("status", ["draft", "confirmed", "paid"])
    .limit(1)
    .maybeSingle();

  if (existingOrderError) {
    throw existingOrderError;
  }

  if (existingOrder) {
    return;
  }

  const { error } = await supabase.from("orders").insert({
    tenant_id: tenantId,
    client_id: clientId,
    conversation_id: conversationId,
    channel: "whatsapp",
    status: "draft",
    notes: "Pedido borrador creado automáticamente desde Chatwoot"
  });

  if (error) {
    throw error;
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const tenantId = request.headers.get("x-cmr-tenant-id") ?? getRequiredEnv("DEFAULT_TENANT_ID");
    const webhookSecret = Deno.env.get("CHATWOOT_WEBHOOK_SECRET");
    const webhookToken = request.headers.get("x-chatwoot-token");

    if (webhookSecret && webhookToken !== webhookSecret) {
      return jsonResponse(401, { error: "Invalid Chatwoot webhook token" });
    }

    const payload = (await request.json()) as ChatwootWebhookPayload;
    const supportedEvents = new Set([
      "message_created",
      "message_updated",
      "conversation_created",
      "conversation_updated"
    ]);

    if (!supportedEvents.has(payload.event ?? "")) {
      return jsonResponse(202, {
        ok: true,
        skipped: true,
        reason: `Unsupported event: ${payload.event ?? "unknown"}`
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const clientId = await ensureClient(supabase, tenantId, payload);
    const conversationId = await ensureConversation(supabase, tenantId, clientId, payload);
    await insertMessage(supabase, tenantId, clientId, conversationId, payload);
    await ensureDraftOrder(supabase, tenantId, clientId, conversationId, payload);

    return jsonResponse(200, {
      ok: true,
      tenant_id: tenantId,
      client_id: clientId,
      conversation_id: conversationId
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unexpected webhook failure"
    });
  }
});
