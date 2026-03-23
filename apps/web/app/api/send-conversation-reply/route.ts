import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type ReplyBody = {
  tenantId?: string;
  conversationId?: string;
  clientId?: string;
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
    const body = (await request.json()) as ReplyBody;
    const tenantId = body.tenantId?.trim();
    const conversationId = body.conversationId?.trim();
    const clientId = body.clientId?.trim();
    const content = body.content?.trim();

    if (!tenantId || !conversationId || !clientId || !content) {
      return NextResponse.json(
        { error: "tenantId, conversationId, clientId y content son requeridos" },
        { status: 400 }
      );
    }

    const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id, source, source_conversation_id, tenant_id")
      .eq("tenant_id", tenantId)
      .eq("id", conversationId)
      .single();

    if (conversationError) {
      throw conversationError;
    }

    let deliveryMode: "chatwoot" | "local" = "local";
    let source = "dashboard";
    let sourceMessageId = `dashboard-outbound-${Date.now().toString(36)}`;

    const chatwootAppUrl = process.env.CHATWOOT_APP_URL?.trim();
    const chatwootAccountId = process.env.CHATWOOT_ACCOUNT_ID?.trim();
    const chatwootApiToken = process.env.CHATWOOT_API_ACCESS_TOKEN?.trim();

    if (
      chatwootAppUrl &&
      chatwootAccountId &&
      chatwootApiToken &&
      conversation.source === "chatwoot" &&
      conversation.source_conversation_id
    ) {
      const chatwootResponse = await fetch(
        `${chatwootAppUrl.replace(/\/$/, "")}/api/v1/accounts/${chatwootAccountId}/conversations/${conversation.source_conversation_id}/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            api_access_token: chatwootApiToken
          },
          body: JSON.stringify({
            content,
            message_type: "outgoing",
            private: false,
            content_type: "text",
            content_attributes: {}
          })
        }
      );

      const chatwootBody = await chatwootResponse.json().catch(() => null);

      if (!chatwootResponse.ok) {
        return NextResponse.json(
          {
            error: "No se pudo enviar a Chatwoot",
            details: chatwootBody
          },
          { status: 502 }
        );
      }

      deliveryMode = "chatwoot";
      source = "chatwoot";
      sourceMessageId =
        String(chatwootBody?.source_id ?? chatwootBody?.id ?? sourceMessageId);
    }

    const { error: insertError } = await supabase.from("messages").insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      client_id: clientId,
      source,
      source_message_id: sourceMessageId,
      direction: "outbound",
      content,
      content_type: "text",
      metadata: {
        origin: "cmr-dashboard",
        delivery_mode: deliveryMode
      },
      sent_at: new Date().toISOString()
    });

    if (insertError) {
      throw insertError;
    }

    const { error: updateConversationError } = await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString()
      })
      .eq("tenant_id", tenantId)
      .eq("id", conversationId);

    if (updateConversationError) {
      throw updateConversationError;
    }

    return NextResponse.json({
      ok: true,
      deliveryMode
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error inesperado al responder"
      },
      { status: 500 }
    );
  }
}
