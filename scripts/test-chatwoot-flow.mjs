import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const cwd = process.cwd();

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
  npm run test:chatwoot-flow -- --tenant-slug mi-negocio

Optional args:
  --tenant-id <uuid>
  --content "Quiero comprar 2 boxes premium"
  --conversation-id chatwoot-test-conv-01
`);
}

async function resolveTenant(supabase, tenantId, tenantSlug) {
  let query = supabase.from("tenants").select("id, slug").limit(1);

  if (tenantId) {
    query = query.eq("id", tenantId);
  } else if (tenantSlug) {
    query = query.eq("slug", tenantSlug);
  } else {
    throw new Error("Pass --tenant-id or --tenant-slug");
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
  const tenantEnvId = process.env.DEFAULT_TENANT_ID?.trim() || null;
  const webhookSecret = process.env.CHATWOOT_WEBHOOK_SECRET?.trim() || null;
  const functionsBaseUrl =
    process.env.SUPABASE_FUNCTIONS_URL?.trim() ||
    `${supabaseUrl.replace(/\/$/, "")}/functions/v1`;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const tenant = await resolveTenant(
    supabase,
    args["tenant-id"]?.trim() || tenantEnvId,
    args["tenant-slug"]?.trim() || null
  );

  const seed = Date.now().toString(36);
  const conversationId = args["conversation-id"]?.trim() || `chatwoot-test-conv-${seed}`;
  const sourceMessageId = `chatwoot-test-msg-${seed}`;
  const phone = `+54911${seed.slice(-6).padStart(6, "0")}`;
  const content = args.content?.trim() || "Quiero comprar 2 boxes premium hoy";

  const payload = {
    event: "message_created",
    id: Number(seed.slice(-6)),
    content,
    message_type: 0,
    content_type: "text",
    account: {
      id: 1,
      name: "CMR Test"
    },
    conversation: {
      id: conversationId,
      status: "open",
      inbox_id: 1,
      meta: {
        sender: {
          phone_number: phone,
          name: "Cliente Test Flow"
        }
      }
    },
    contact: {
      id: 1,
      name: "Cliente Test Flow",
      phone_number: phone,
      email: `flow-${seed}@example.com`
    },
    messages: [
      {
        id: Number(seed.slice(-6)),
        content,
        content_type: "text",
        created_at: Math.floor(Date.now() / 1000),
        message_type: 0,
        source_id: sourceMessageId
      }
    ]
  };

  const response = await fetch(`${functionsBaseUrl}/chatwoot-webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(webhookSecret ? { "x-chatwoot-token": webhookSecret } : {})
    },
    body: JSON.stringify(payload)
  });

  const responseBody = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Webhook failed with ${response.status}: ${JSON.stringify(responseBody ?? {})}`
    );
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, full_name, phone")
    .eq("tenant_id", tenant.id)
    .eq("phone", phone)
    .single();

  if (clientError) {
    throw clientError;
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, status, source_conversation_id")
    .eq("tenant_id", tenant.id)
    .eq("source", "chatwoot")
    .eq("source_conversation_id", conversationId)
    .single();

  if (conversationError) {
    throw conversationError;
  }

  const { data: message, error: messageError } = await supabase
    .from("messages")
    .select("id, direction, content")
    .eq("tenant_id", tenant.id)
    .eq("source", "chatwoot")
    .eq("source_message_id", sourceMessageId)
    .single();

  if (messageError) {
    throw messageError;
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status, channel")
    .eq("tenant_id", tenant.id)
    .eq("conversation_id", conversation.id)
    .in("status", ["draft", "confirmed", "paid"])
    .limit(1)
    .maybeSingle();

  if (orderError) {
    throw orderError;
  }

  console.log(
    JSON.stringify(
      {
        webhook: responseBody,
        tenantId: tenant.id,
        client,
        conversation,
        message,
        draftOrder: order
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
