import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type SimulationBody = {
  tenantId?: string;
  content?: string;
};

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export async function POST(request: Request) {
  try {
    const { tenantId, content } = (await request.json()) as SimulationBody;

    if (!tenantId?.trim()) {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }

    const messageContent = content?.trim();

    if (!messageContent) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
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

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, slug")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenantError) {
      throw tenantError;
    }

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const seed = Date.now().toString(36);
    const conversationId = `chatwoot-sim-conv-${seed}`;
    const sourceMessageId = `chatwoot-sim-msg-${seed}`;
    const phone = `+54911${seed.slice(-6).padStart(6, "0")}`;

    const payload = {
      event: "message_created",
      id: Number(seed.slice(-6).replace(/\D/gu, "").slice(0, 6) || "1"),
      content: messageContent,
      message_type: 0,
      content_type: "text",
      account: {
        id: 1,
        name: "CMR Simulation"
      },
      conversation: {
        id: conversationId,
        status: "open",
        inbox_id: 1,
        meta: {
          sender: {
            phone_number: phone,
            name: "Cliente Simulado"
          }
        }
      },
      contact: {
        id: 1,
        name: "Cliente Simulado",
        phone_number: phone,
        email: `sim-${seed}@example.com`
      },
      messages: [
        {
          id: 1,
          content: messageContent,
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
        "x-chatwoot-token": webhookSecret ?? "",
        "x-cmr-tenant-id": tenant.id
      },
      body: JSON.stringify(payload)
    });

    const responseBody = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Webhook failed with ${response.status}`, details: responseBody },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      webhook: responseBody
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected simulation error"
      },
      { status: 500 }
    );
  }
}
