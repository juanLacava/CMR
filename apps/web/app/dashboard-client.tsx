"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

import { createBrowserSupabaseClient } from "../lib/supabase";
import type {
  ClientRow,
  ConversationDetail,
  ConversationRow,
  DashboardData,
  DashboardStats,
  MembershipDirectoryEntry,
  OrderRow,
  ProductRow,
  TenantMembership
} from "../lib/types";

type DashboardClientProps = {
  chatwootAppUrl: string;
};

type ProductFormState = {
  id: string | null;
  name: string;
  sku: string;
  description: string;
  price: string;
  currency: string;
  stockOnHand: string;
  stockMinimum: string;
  isActive: boolean;
};

type OrderComposerItem = {
  productId: string;
  quantity: string;
};

const orderStatusOptions = ["draft", "confirmed", "paid", "fulfilled", "cancelled"] as const;
const conversationStatusOptions = ["open", "pending", "resolved"] as const;
const conversationFilterOptions = ["all", "open", "with-order", "without-order", "awaiting-reply"] as const;
const quickReplyTemplates = [
  "Hola, ya lo estoy revisando y te respondo en unos minutos.",
  "Perfecto, te confirmo stock y precio enseguida.",
  "Gracias. Quedó registrado y seguimos por acá."
] as const;

const emptyData = (): DashboardData => ({
  stats: {
    clients: 0,
    activeConversations: 0,
    pendingOrders: 0,
    lowStockProducts: 0
  },
  clients: [],
  products: [],
  orders: [],
  conversations: []
});

const membershipRoleOptions: TenantMembership["role"][] = ["owner", "admin", "agent", "viewer"];

const emptyProductForm = (): ProductFormState => ({
  id: null,
  name: "",
  sku: "",
  description: "",
  price: "",
  currency: "ARS",
  stockOnHand: "0",
  stockMinimum: "0",
  isActive: true
});

const emptyOrderItem = (): OrderComposerItem => ({
  productId: "",
  quantity: "1"
});

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency
  }).format(amount);
}

function formatDate(date: string | null) {
  if (!date) {
    return "Sin actividad";
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(date));
}

function stockChip(stock: number, reserved: number, minimum: number) {
  const available = stock - reserved;

  if (available <= minimum) {
    return "chip chip-danger";
  }

  if (available <= minimum + 3) {
    return "chip chip-warning";
  }

  return "chip";
}

function conversationSignalChip(
  signal: "new-client" | "no-order" | "draft-order" | "replied" | "awaiting-client" | "unanswered"
) {
  switch (signal) {
    case "unanswered":
      return "chip chip-danger";
    case "no-order":
      return "chip chip-warning";
    case "draft-order":
      return "chip chip-info";
    case "replied":
      return "chip chip-success";
    case "awaiting-client":
      return "chip chip-info";
    case "new-client":
      return "chip";
    default:
      return "chip";
  }
}

function getConversationPriority(conversation: ConversationRow) {
  if (conversation.awaiting_reply) {
    return 0;
  }

  if (!conversation.has_order) {
    return 1;
  }

  if (conversation.order_status === "draft") {
    return 2;
  }

  return 3;
}

function getSlaBucket(lastMessageAt: string | null, awaitingReply: boolean) {
  if (!awaitingReply || !lastMessageAt) {
    return "ok" as const;
  }

  const ageMinutes = Math.floor((Date.now() - new Date(lastMessageAt).getTime()) / 60000);

  if (ageMinutes >= 60) {
    return "breach" as const;
  }

  if (ageMinutes >= 15) {
    return "warning" as const;
  }

  return "ok" as const;
}

function getSlaChip(bucket: "ok" | "warning" | "breach") {
  if (bucket === "breach") {
    return "chip chip-danger";
  }

  if (bucket === "warning") {
    return "chip chip-warning";
  }

  return "chip chip-success";
}

function getConversationPriorityLabel(conversation: ConversationRow) {
  if (conversation.awaiting_reply) {
    return "Urgente";
  }

  if (!conversation.has_order) {
    return "Comercial";
  }

  if (conversation.order_status === "draft") {
    return "Seguimiento";
  }

  return "Resuelto";
}

function getOrderStatusLabel(status: (typeof orderStatusOptions)[number] | string) {
  switch (status) {
    case "draft":
      return "borrador";
    case "confirmed":
      return "confirmado";
    case "paid":
      return "pagado";
    case "fulfilled":
      return "entregado";
    case "cancelled":
      return "cancelado";
    default:
      return status;
  }
}

function getConversationStatusLabel(status: (typeof conversationStatusOptions)[number] | string) {
  switch (status) {
    case "open":
      return "abierta";
    case "pending":
      return "pendiente";
    case "resolved":
      return "resuelta";
    default:
      return status;
  }
}

function getRoleLabel(role: TenantMembership["role"] | string) {
  switch (role) {
    case "owner":
      return "titular";
    case "admin":
      return "administrador";
    case "agent":
      return "agente";
    case "viewer":
      return "lector";
    default:
      return role;
  }
}

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Error inesperado";
}

function isInvalidRefreshTokenError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("Invalid Refresh Token") ||
    error.message.includes("Refresh Token Not Found")
  );
}

function canManageMemberships(role: TenantMembership["role"] | null | undefined) {
  return role === "owner" || role === "admin";
}

function canManageProducts(role: TenantMembership["role"] | null | undefined) {
  return role === "owner" || role === "admin";
}

function canWriteOrders(role: TenantMembership["role"] | null | undefined) {
  return role === "owner" || role === "admin" || role === "agent";
}

async function loadMemberships(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, role, tenant:tenants(id, name, slug)")
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<{
    tenant_id: string;
    role: TenantMembership["role"];
    tenant: Array<NonNullable<TenantMembership["tenant"]>>;
  }>).map((membership) => ({
    tenant_id: membership.tenant_id,
    role: membership.role,
    tenant: membership.tenant[0] ?? null
  }));
}

async function loadDashboard(supabase: SupabaseClient, tenantId: string) {
  const [
    clientsCountResult,
    activeConversationsCountResult,
    pendingOrdersCountResult,
    clientsResult,
    productsResult,
    ordersResult,
    conversationsResult
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["open", "pending"]),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["draft", "confirmed", "paid"]),
    supabase
      .from("clients")
      .select("id, full_name, phone, tags, last_interaction_at")
      .eq("tenant_id", tenantId)
      .order("last_interaction_at", { ascending: false, nullsFirst: false })
      .limit(8),
    supabase
      .from("products")
      .select(
        "id, name, sku, description, stock_on_hand, stock_reserved, stock_minimum, price, currency, is_active"
      )
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("stock_on_hand", { ascending: true })
      .limit(8),
    supabase
      .from("orders")
      .select("id, status, total_amount, currency, created_at, client:clients(full_name, phone)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("conversations")
      .select(
        "id, status, channel, source, source_conversation_id, last_message_at, assigned_to, client_id, client:clients(full_name, phone, created_at)"
      )
      .eq("tenant_id", tenantId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(20)
  ]);

  const errors = [
    clientsCountResult.error,
    activeConversationsCountResult.error,
    pendingOrdersCountResult.error,
    clientsResult.error,
    productsResult.error,
    ordersResult.error,
    conversationsResult.error
  ].filter(Boolean);

  if (errors.length > 0) {
    throw errors[0];
  }

  const products = (productsResult.data ?? []) as ProductRow[];
  const rawConversations = (conversationsResult.data ?? []) as Array<{
    id: string;
    status: string;
    channel: string;
    source: string;
    source_conversation_id: string | null;
    last_message_at: string | null;
    assigned_to: string | null;
    client_id: string;
    client: Array<
      NonNullable<ConversationRow["client"]> & {
        created_at: string;
      }
    >;
  }>;
  const conversationIds = rawConversations.map((conversation) => conversation.id);

  let orderByConversationId = new Set<string>();
  let orderStatusByConversationId = new Map<string, string>();
  let latestDirectionByConversationId = new Map<string, "inbound" | "outbound">();
  let unreadCountByConversationId = new Map<string, number>();

  if (conversationIds.length > 0) {
    const [conversationOrdersResult, conversationMessagesResult] = await Promise.all([
      supabase
        .from("orders")
        .select("conversation_id, status")
        .eq("tenant_id", tenantId)
        .in("conversation_id", conversationIds),
      supabase
        .from("messages")
        .select("conversation_id, direction, sent_at")
        .eq("tenant_id", tenantId)
        .in("conversation_id", conversationIds)
        .order("sent_at", { ascending: false })
        .limit(200)
    ]);

    if (conversationOrdersResult.error) {
      throw conversationOrdersResult.error;
    }

    if (conversationMessagesResult.error) {
      throw conversationMessagesResult.error;
    }

    orderByConversationId = new Set(
      (conversationOrdersResult.data ?? [])
        .map((order) => order.conversation_id)
        .filter((value): value is string => typeof value === "string")
    );

    for (const order of conversationOrdersResult.data ?? []) {
      if (typeof order.conversation_id === "string" && !orderStatusByConversationId.has(order.conversation_id)) {
        orderStatusByConversationId.set(order.conversation_id, order.status);
      }
    }

    for (const message of conversationMessagesResult.data ?? []) {
      if (
        typeof message.conversation_id === "string" &&
        !latestDirectionByConversationId.has(message.conversation_id)
      ) {
        latestDirectionByConversationId.set(
          message.conversation_id,
          message.direction as "inbound" | "outbound"
        );
      }
    }

    const inboundStreakBroken = new Set<string>();

    for (const message of conversationMessagesResult.data ?? []) {
      if (typeof message.conversation_id !== "string") {
        continue;
      }

      if (message.direction === "outbound") {
        inboundStreakBroken.add(message.conversation_id);
        continue;
      }

      if (message.direction === "inbound" && !inboundStreakBroken.has(message.conversation_id)) {
        unreadCountByConversationId.set(
          message.conversation_id,
          (unreadCountByConversationId.get(message.conversation_id) ?? 0) + 1
        );
      }
    }
  }

  const stats: DashboardStats = {
    clients: clientsCountResult.count ?? 0,
    activeConversations: activeConversationsCountResult.count ?? 0,
    pendingOrders: pendingOrdersCountResult.count ?? 0,
    lowStockProducts: products.filter(
      (product) => product.stock_on_hand - product.stock_reserved <= product.stock_minimum
    ).length
  };

  return {
    stats,
    clients: (clientsResult.data ?? []) as ClientRow[],
    products,
    orders: ((ordersResult.data ?? []) as Array<{
      id: string;
      status: string;
      total_amount: number;
      currency: string;
      created_at: string;
      client: Array<NonNullable<OrderRow["client"]>>;
    }>).map((order) => ({
      id: order.id,
      status: order.status,
      total_amount: order.total_amount,
      currency: order.currency,
      created_at: order.created_at,
      client: order.client[0] ?? null
    })),
    conversations: rawConversations.map((conversation) => ({
      id: conversation.id,
      status: conversation.status,
      channel: conversation.channel,
      source: conversation.source,
      source_conversation_id: conversation.source_conversation_id,
      last_message_at: conversation.last_message_at,
      assigned_to: conversation.assigned_to,
      has_order: orderByConversationId.has(conversation.id),
      order_status: orderStatusByConversationId.get(conversation.id) ?? null,
      awaiting_reply: latestDirectionByConversationId.get(conversation.id) === "inbound",
      unread_count: unreadCountByConversationId.get(conversation.id) ?? 0,
      sla_bucket: getSlaBucket(
        conversation.last_message_at,
        latestDirectionByConversationId.get(conversation.id) === "inbound"
      ),
      is_new_client:
        Boolean(conversation.client[0]?.created_at) &&
        Date.now() - new Date(conversation.client[0].created_at).getTime() < 1000 * 60 * 60 * 24,
      client: conversation.client[0]
        ? {
            full_name: conversation.client[0].full_name,
            phone: conversation.client[0].phone
          }
        : null
    }))
  };
}

async function loadComposerOptions(supabase: SupabaseClient, tenantId: string) {
  const [clientsResult, productsResult] = await Promise.all([
    supabase
      .from("clients")
      .select("id, full_name, phone, tags, last_interaction_at")
      .eq("tenant_id", tenantId)
      .order("full_name", { ascending: true })
      .limit(100),
    supabase
      .from("products")
      .select(
        "id, name, sku, description, stock_on_hand, stock_reserved, stock_minimum, price, currency, is_active"
      )
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true })
      .limit(100)
  ]);

  if (clientsResult.error) {
    throw clientsResult.error;
  }

  if (productsResult.error) {
    throw productsResult.error;
  }

  return {
    clients: (clientsResult.data ?? []) as ClientRow[],
    products: (productsResult.data ?? []) as ProductRow[]
  };
}

async function loadConversationDetail(
  supabase: SupabaseClient,
  tenantId: string,
  conversationId: string
) {
  const [conversationResult, messagesResult, orderResult] = await Promise.all([
    supabase
      .from("conversations")
      .select(
        "id, status, channel, source, source_conversation_id, last_message_at, assigned_to, client:clients(full_name, phone, created_at)"
      )
      .eq("tenant_id", tenantId)
      .eq("id", conversationId)
      .single(),
    supabase
      .from("messages")
      .select("id, direction, content, content_type, sent_at")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: true })
      .limit(50),
    supabase
      .from("orders")
      .select("id, status, total_amount, currency")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (conversationResult.error) {
    throw conversationResult.error;
  }

  if (messagesResult.error) {
    throw messagesResult.error;
  }

  if (orderResult.error) {
    throw orderResult.error;
  }

  const conversationData = conversationResult.data as {
    id: string;
    status: string;
    channel: string;
    source: string;
    source_conversation_id: string | null;
    last_message_at: string | null;
    assigned_to: string | null;
    client: Array<NonNullable<ConversationRow["client"]>>;
  };

  const detailMessages = messagesResult.data ?? [];
  const latestDetailMessage = detailMessages[detailMessages.length - 1];
  let unreadCount = 0;

  for (let index = detailMessages.length - 1; index >= 0; index -= 1) {
    const message = detailMessages[index];

    if (message.direction === "outbound") {
      break;
    }

    if (message.direction === "inbound") {
      unreadCount += 1;
    }
  }

  return {
    conversation: {
      id: conversationData.id,
      status: conversationData.status,
      channel: conversationData.channel,
      source: conversationData.source,
      source_conversation_id: conversationData.source_conversation_id,
      last_message_at: conversationData.last_message_at,
      assigned_to: conversationData.assigned_to,
      has_order: Boolean(orderResult.data),
      order_status: orderResult.data?.status ?? null,
      awaiting_reply: (latestDetailMessage?.direction ?? "outbound") === "inbound",
      unread_count: unreadCount,
      sla_bucket: getSlaBucket(
        conversationData.last_message_at,
        (latestDetailMessage?.direction ?? "outbound") === "inbound"
      ),
      is_new_client:
        Boolean((conversationData.client[0] as { created_at?: string } | undefined)?.created_at) &&
        Date.now() -
          new Date((conversationData.client[0] as { created_at?: string }).created_at ?? 0).getTime() <
          1000 * 60 * 60 * 24,
      client: conversationData.client[0]
        ? {
            full_name: conversationData.client[0].full_name,
            phone: conversationData.client[0].phone
          }
        : null
    },
    messages: detailMessages,
    order: orderResult.data ?? null
  } satisfies ConversationDetail;
}

async function loadMembershipDirectory(supabase: SupabaseClient, tenantId: string) {
  const { data, error } = await supabase.rpc("list_tenant_memberships", {
    target_tenant_id: tenantId
  });

  if (error) {
    throw error;
  }

  return (data ?? []) as MembershipDirectoryEntry[];
}

export function DashboardClient({ chatwootAppUrl }: DashboardClientProps) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData>(emptyData());
  const [clientOptions, setClientOptions] = useState<ClientRow[]>([]);
  const [productOptions, setProductOptions] = useState<ProductRow[]>([]);
  const [directoryEntries, setDirectoryEntries] = useState<MembershipDirectoryEntry[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversationDetail, setConversationDetail] = useState<ConversationDetail | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [simulatingWhatsapp, setSimulatingWhatsapp] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [savingAssignee, setSavingAssignee] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [updatingConversationId, setUpdatingConversationId] = useState<string | null>(null);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<TenantMembership["role"]>("agent");
  const [membershipActionPending, setMembershipActionPending] = useState(false);
  const [productForm, setProductForm] = useState<ProductFormState>(emptyProductForm());
  const [selectedClientId, setSelectedClientId] = useState("");
  const [orderStatus, setOrderStatus] =
    useState<(typeof orderStatusOptions)[number]>("draft");
  const [orderNotes, setOrderNotes] = useState("");
  const [orderItems, setOrderItems] = useState<OrderComposerItem[]>([emptyOrderItem()]);
  const [orderStatusDrafts, setOrderStatusDrafts] = useState<Record<string, string>>({});
  const [conversationStatusDrafts, setConversationStatusDrafts] = useState<Record<string, string>>({});
  const [simulationContent, setSimulationContent] = useState("Quiero comprar 2 boxes premium hoy");
  const [replyDraft, setReplyDraft] = useState("");
  const [assignedToDraft, setAssignedToDraft] = useState("");
  const [conversationFilter, setConversationFilter] =
    useState<(typeof conversationFilterOptions)[number]>("all");
  const [conversationSearch, setConversationSearch] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const conversationSearchRef = useRef<HTMLInputElement | null>(null);
  const replyInputRef = useRef<HTMLInputElement | null>(null);
  const assignablePeople = [
    {
      label: session?.user.user_metadata?.full_name?.trim() || session?.user.email || "Mi usuario",
      value: session?.user.user_metadata?.full_name?.trim() || session?.user.email || "Mi usuario"
    },
    ...directoryEntries
      .map((entry) => ({
        label: entry.full_name?.trim() || entry.email,
        value: entry.full_name?.trim() || entry.email
      }))
      .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.value === entry.value) === index)
  ];

  useEffect(() => {
    setSupabase(createBrowserSupabaseClient());
  }, []);

  useEffect(() => {
    let ignore = false;

    if (!supabase) {
      return;
    }

    const client = supabase;

    async function initializeSession() {
      const { data: sessionData, error } = await client.auth.getSession();

      if (ignore) {
        return;
      }

      if (error) {
        if (isInvalidRefreshTokenError(error)) {
          await client.auth.signOut({ scope: "local" });

          if (ignore) {
            return;
          }

          setSession(null);
          setNotice("La sesion guardada vencio. Volve a iniciar sesion.");
          setErrorMessage(null);
          setLoadingSession(false);
          return;
        }

        setErrorMessage(error.message);
      }

      setSession(sessionData.session);
      setLoadingSession(false);
    }

    void initializeSession();

    const {
      data: { subscription }
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (ignore) {
        return;
      }

      setSession(nextSession);
      setNotice(null);
      setErrorMessage(null);
    });

    return () => {
      ignore = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    let ignore = false;

    async function syncMemberships() {
      if (!supabase) {
        return;
      }

      if (!session?.user.id) {
        setMemberships([]);
        setSelectedTenantId(null);
        setData(emptyData());
        setClientOptions([]);
        setProductOptions([]);
        return;
      }

      try {
        const nextMemberships = await loadMemberships(supabase);

        if (ignore) {
          return;
        }

        setMemberships(nextMemberships);

        if (nextMemberships.length === 0) {
          setSelectedTenantId(null);
          setData(emptyData());
          setClientOptions([]);
          setProductOptions([]);
          setNotice("Tu usuario existe, pero todavía no tiene acceso a ningún negocio.");
          return;
        }

        setNotice(null);

        setSelectedTenantId((currentTenantId) => {
          if (currentTenantId && nextMemberships.some((membership) => membership.tenant_id === currentTenantId)) {
            return currentTenantId;
          }

          return nextMemberships[0]?.tenant_id ?? null;
        });
      } catch (error) {
        if (!ignore) {
          setErrorMessage(formatErrorMessage(error));
        }
      }
    }

    void syncMemberships();

    return () => {
      ignore = true;
    };
  }, [session?.user.id, supabase]);

  useEffect(() => {
    let ignore = false;

    async function syncDashboard() {
      if (!supabase || !selectedTenantId) {
        setData(emptyData());
        setClientOptions([]);
        setProductOptions([]);
        return;
      }

      setLoadingData(true);

      try {
        const [nextData, nextOptions] = await Promise.all([
          loadDashboard(supabase, selectedTenantId),
          loadComposerOptions(supabase, selectedTenantId)
        ]);

        if (!ignore) {
          setData(nextData);
          setClientOptions(nextOptions.clients);
          setProductOptions(nextOptions.products);
          setOrderStatusDrafts(
            Object.fromEntries(nextData.orders.map((order) => [order.id, order.status]))
          );
          setConversationStatusDrafts(
            Object.fromEntries(nextData.conversations.map((conversation) => [conversation.id, conversation.status]))
          );
          setErrorMessage(null);
        }
      } catch (error) {
        if (!ignore) {
          setData(emptyData());
          setClientOptions([]);
          setProductOptions([]);
          setErrorMessage(formatErrorMessage(error));
        }
      } finally {
        if (!ignore) {
          setLoadingData(false);
        }
      }
    }

    void syncDashboard();

    return () => {
      ignore = true;
    };
  }, [selectedTenantId, supabase]);

  useEffect(() => {
    let ignore = false;

    async function syncMembershipDirectory() {
      if (!supabase || !selectedTenantId) {
        setDirectoryEntries([]);
        setLoadingDirectory(false);
        return;
      }

      const currentMembership =
        memberships.find((membership) => membership.tenant_id === selectedTenantId) ?? null;

      if (!canManageMemberships(currentMembership?.role)) {
        setDirectoryEntries([]);
        setLoadingDirectory(false);
        return;
      }

      setLoadingDirectory(true);

      try {
        const nextEntries = await loadMembershipDirectory(supabase, selectedTenantId);

        if (!ignore) {
          setDirectoryEntries(nextEntries);
        }
      } catch (error) {
        if (!ignore) {
          setDirectoryEntries([]);
          setErrorMessage(formatErrorMessage(error));
        }
      } finally {
        if (!ignore) {
          setLoadingDirectory(false);
        }
      }
    }

    void syncMembershipDirectory();

    return () => {
      ignore = true;
    };
  }, [memberships, selectedTenantId, supabase]);

  useEffect(() => {
    setProductForm(emptyProductForm());
    setSelectedClientId("");
    setOrderStatus("draft");
    setOrderNotes("");
    setOrderItems([emptyOrderItem()]);
    setSelectedConversationId(null);
    setConversationDetail(null);
  }, [selectedTenantId]);

  useEffect(() => {
    if (selectedConversationId) {
      const exists = data.conversations.some((conversation) => conversation.id === selectedConversationId);

      if (!exists) {
        setSelectedConversationId(data.conversations[0]?.id ?? null);
      }

      return;
    }

    if (data.conversations.length > 0) {
      setSelectedConversationId(data.conversations[0].id);
    }
  }, [data.conversations, selectedConversationId]);

  useEffect(() => {
    let ignore = false;

    async function syncConversationDetail() {
      if (!supabase || !selectedTenantId || !selectedConversationId) {
        setConversationDetail(null);
        return;
      }

      setLoadingConversation(true);

      try {
        const nextDetail = await loadConversationDetail(
          supabase,
          selectedTenantId,
          selectedConversationId
        );

        if (!ignore) {
          setConversationDetail(nextDetail);
          setReplyDraft("");
          setAssignedToDraft(nextDetail.conversation.assigned_to ?? "");
        }
      } catch (error) {
        if (!ignore) {
          setConversationDetail(null);
          setErrorMessage(formatErrorMessage(error));
        }
      } finally {
        if (!ignore) {
          setLoadingConversation(false);
        }
      }
    }

    void syncConversationDetail();

    return () => {
      ignore = true;
    };
  }, [selectedConversationId, selectedTenantId, supabase]);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setNotice(null);

    if (!supabase) {
      setErrorMessage("Supabase todavia no inicializo en el navegador.");
      return;
    }

    if (authMode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setNotice("Cuenta creada. Si tu proyecto exige confirmación por email, validala antes de entrar.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setPassword("");
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setData(emptyData());
    setMemberships([]);
    setSelectedTenantId(null);
    setClientOptions([]);
    setProductOptions([]);
    setDirectoryEntries([]);
  }

  const activeMembership =
    memberships.find((membership) => membership.tenant_id === selectedTenantId) ?? null;
  const membershipAdminEnabled = canManageMemberships(activeMembership?.role);
  const productAdminEnabled = canManageProducts(activeMembership?.role);
  const orderWriteEnabled = canWriteOrders(activeMembership?.role);
  const priorityClients = data.clients.slice(0, 3);
  const attentionOrders = data.orders.filter((order) =>
    ["draft", "confirmed", "paid"].includes(order.status)
  );
  const criticalProducts = data.products.filter(
    (product) => product.stock_on_hand - product.stock_reserved <= product.stock_minimum
  );
  const recentConversations = data.conversations.slice(0, 6);
  const visibleConversations = data.conversations
    .filter((conversation) => {
      const search = conversationSearch.trim().toLowerCase();

      if (search) {
        const haystack = [
          conversation.client?.full_name ?? "",
          conversation.client?.phone ?? "",
          conversation.source_conversation_id ?? "",
          conversation.channel,
          conversation.status
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(search)) {
          return false;
        }
      }

      if (conversationFilter === "open") {
        return conversation.status === "open";
      }

      if (conversationFilter === "with-order") {
        return conversation.has_order;
      }

      if (conversationFilter === "without-order") {
        return !conversation.has_order;
      }

      if (conversationFilter === "awaiting-reply") {
        return conversation.awaiting_reply;
      }

      return true;
    })
    .sort((left, right) => {
      const priorityDiff = getConversationPriority(left) - getConversationPriority(right);

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      const leftTime = left.last_message_at ? new Date(left.last_message_at).getTime() : 0;
      const rightTime = right.last_message_at ? new Date(right.last_message_at).getTime() : 0;

      return rightTime - leftTime;
    });
  const groupedConversations = visibleConversations.reduce<
    Array<{ title: string; items: ConversationRow[] }>
  >((groups, conversation) => {
    const title = getConversationPriorityLabel(conversation);
    const currentGroup = groups[groups.length - 1];

    if (!currentGroup || currentGroup.title !== title) {
      groups.push({
        title,
        items: [conversation]
      });
      return groups;
    }

    currentGroup.items.push(conversation);
    return groups;
  }, []);

  useEffect(() => {
    function handleKeyboardShortcuts(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        conversationSearchRef.current?.focus();
        return;
      }

      if (event.key.toLowerCase() === "r" && !isTyping) {
        event.preventDefault();
        replyInputRef.current?.focus();
        return;
      }

      if (event.key.toLowerCase() === "j" && !isTyping && visibleConversations.length > 0) {
        event.preventDefault();
        const currentIndex = visibleConversations.findIndex(
          (conversation) => conversation.id === selectedConversationId
        );
        const nextIndex =
          currentIndex < 0 ? 0 : Math.min(currentIndex + 1, visibleConversations.length - 1);
        setSelectedConversationId(visibleConversations[nextIndex].id);
        return;
      }

      if (event.key.toLowerCase() === "k" && !isTyping && visibleConversations.length > 0) {
        event.preventDefault();
        const currentIndex = visibleConversations.findIndex(
          (conversation) => conversation.id === selectedConversationId
        );
        const nextIndex = currentIndex < 0 ? 0 : Math.max(currentIndex - 1, 0);
        setSelectedConversationId(visibleConversations[nextIndex].id);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && replyDraft.trim().length > 0) {
        event.preventDefault();
        void handleConversationReply();
        return;
      }

      if (!isTyping && selectedConversationId) {
        if (event.key === "1") {
          event.preventDefault();
          setConversationStatusDrafts((current) => ({ ...current, [selectedConversationId]: "open" }));
          return;
        }

        if (event.key === "2") {
          event.preventDefault();
          setConversationStatusDrafts((current) => ({ ...current, [selectedConversationId]: "pending" }));
          return;
        }

        if (event.key === "3") {
          event.preventDefault();
          setConversationStatusDrafts((current) => ({ ...current, [selectedConversationId]: "resolved" }));
        }
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcuts);

    return () => {
      window.removeEventListener("keydown", handleKeyboardShortcuts);
    };
  }, [replyDraft, selectedConversationId, visibleConversations]);

  async function refreshMembershipViews(targetTenantId: string) {
    if (!supabase) {
      return;
    }

    const nextMemberships = await loadMemberships(supabase);
    const nextActiveMembership =
      nextMemberships.find((membership) => membership.tenant_id === targetTenantId) ?? null;
    const nextDirectoryEntries = canManageMemberships(nextActiveMembership?.role)
      ? await loadMembershipDirectory(supabase, targetTenantId)
      : [];

    setMemberships(nextMemberships);
    setDirectoryEntries(nextDirectoryEntries);
  }

  async function refreshOperationalViews(targetTenantId: string) {
    if (!supabase) {
      return;
    }

    const [nextData, nextOptions] = await Promise.all([
      loadDashboard(supabase, targetTenantId),
      loadComposerOptions(supabase, targetTenantId)
    ]);

    setData(nextData);
    setClientOptions(nextOptions.clients);
    setProductOptions(nextOptions.products);
    setOrderStatusDrafts(Object.fromEntries(nextData.orders.map((order) => [order.id, order.status])));
    setConversationStatusDrafts(
      Object.fromEntries(nextData.conversations.map((conversation) => [conversation.id, conversation.status]))
    );
  }

  async function handleMembershipSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !selectedTenantId) {
      return;
    }

    setMembershipActionPending(true);
    setErrorMessage(null);
    setNotice(null);

    try {
      const { error } = await supabase.rpc("upsert_tenant_membership_by_email", {
        target_tenant_id: selectedTenantId,
        target_email: memberEmail,
        target_role: memberRole
      });

      if (error) {
        throw error;
      }

      await refreshMembershipViews(selectedTenantId);
      setMemberEmail("");
      setMemberRole("agent");
      setNotice("Acceso actualizado.");
    } catch (error) {
      setErrorMessage(formatErrorMessage(error));
    } finally {
      setMembershipActionPending(false);
    }
  }

  async function handleMembershipDelete(entry: MembershipDirectoryEntry) {
    if (!supabase || !selectedTenantId) {
      return;
    }

    setMembershipActionPending(true);
    setErrorMessage(null);
    setNotice(null);

    try {
      const { error } = await supabase.rpc("remove_tenant_membership", {
        target_membership_id: entry.membership_id
      });

      if (error) {
        throw error;
      }

      await refreshMembershipViews(selectedTenantId);
      setNotice(`Acceso removido para ${entry.email}.`);
    } catch (error) {
      setErrorMessage(formatErrorMessage(error));
    } finally {
      setMembershipActionPending(false);
    }
  }

  function startProductEdit(product: ProductRow) {
    setProductForm({
      id: product.id,
      name: product.name,
      sku: product.sku,
      description: product.description ?? "",
      price: product.price.toString(),
      currency: product.currency,
      stockOnHand: product.stock_on_hand.toString(),
      stockMinimum: product.stock_minimum.toString(),
      isActive: product.is_active
    });
  }

  function resetProductForm() {
    setProductForm(emptyProductForm());
  }

  function updateOrderItem(index: number, nextValue: Partial<OrderComposerItem>) {
    setOrderItems((currentItems) =>
      currentItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...nextValue } : item
      )
    );
  }

  async function handleProductSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !selectedTenantId) {
      return;
    }

    setSavingProduct(true);
    setErrorMessage(null);
    setNotice(null);

    try {
      const { error } = await supabase.rpc("upsert_product", {
        target_tenant_id: selectedTenantId,
        target_name: productForm.name,
        target_sku: productForm.sku,
        target_description: productForm.description,
        target_price: Number(productForm.price),
        target_currency: productForm.currency,
        target_stock_on_hand: Number(productForm.stockOnHand),
        target_stock_minimum: Number(productForm.stockMinimum),
        target_is_active: productForm.isActive,
        target_product_id: productForm.id
      });

      if (error) {
        throw error;
      }

      await refreshOperationalViews(selectedTenantId);
      resetProductForm();
      setNotice("Producto guardado.");
    } catch (error) {
      setErrorMessage(formatErrorMessage(error));
    } finally {
      setSavingProduct(false);
    }
  }

  async function handleOrderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !selectedTenantId) {
      return;
    }

    setSavingOrder(true);
    setErrorMessage(null);
    setNotice(null);

    try {
      const sanitizedItems = orderItems
        .map((item) => ({
          product_id: item.productId,
          quantity: Number(item.quantity)
        }))
        .filter((item) => item.product_id && item.quantity > 0);

      const { error } = await supabase.rpc("create_manual_order", {
        target_tenant_id: selectedTenantId,
        target_client_id: selectedClientId,
        target_items: sanitizedItems,
        target_status: orderStatus,
        target_notes: orderNotes,
        target_channel: "manual",
        target_conversation_id: null
      });

      if (error) {
        throw error;
      }

      await refreshOperationalViews(selectedTenantId);
      setSelectedClientId("");
      setOrderStatus("draft");
      setOrderNotes("");
      setOrderItems([emptyOrderItem()]);
      setNotice("Pedido creado.");
    } catch (error) {
      setErrorMessage(formatErrorMessage(error));
    } finally {
      setSavingOrder(false);
    }
  }

  async function handleOrderStatusSave(orderId: string) {
    if (!supabase || !selectedTenantId) {
      return;
    }

    setUpdatingOrderId(orderId);
    setErrorMessage(null);
    setNotice(null);

    try {
      const { error } = await supabase.rpc("set_order_status", {
        target_order_id: orderId,
        target_status: orderStatusDrafts[orderId] ?? "draft"
      });

      if (error) {
        throw error;
      }

      await refreshOperationalViews(selectedTenantId);
      setNotice("Estado del pedido actualizado.");
    } catch (error) {
      setErrorMessage(formatErrorMessage(error));
    } finally {
      setUpdatingOrderId(null);
    }
  }

  async function handleWhatsappSimulation() {
    if (!selectedTenantId) {
      return;
    }

    setSimulatingWhatsapp(true);
    setErrorMessage(null);
    setNotice(null);

    try {
      const response = await fetch("/api/simulate-whatsapp", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          tenantId: selectedTenantId,
          content: simulationContent
        })
      });

      const responseBody = (await response.json().catch(() => null)) as
        | { error?: string; details?: unknown }
        | null;

      if (!response.ok) {
        throw new Error(responseBody?.error ?? "No se pudo simular el mensaje");
      }

      await refreshOperationalViews(selectedTenantId);
      setNotice("Mensaje de WhatsApp simulado y sincronizado.");
    } catch (error) {
      setErrorMessage(formatErrorMessage(error));
    } finally {
      setSimulatingWhatsapp(false);
    }
  }

  async function handleConversationReply() {
    if (!supabase || !selectedTenantId || !conversationDetail || replyDraft.trim().length === 0) {
      return;
    }

    setSendingReply(true);
    setErrorMessage(null);
    setNotice(null);

    try {
      const matchingClient = clientOptions.find(
        (client) => client.phone === conversationDetail.conversation.client?.phone
      );

      if (!matchingClient) {
        throw new Error("No se pudo resolver el cliente de la conversación.");
      }

      const response = await fetch("/api/send-conversation-reply", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          tenantId: selectedTenantId,
          conversationId: conversationDetail.conversation.id,
          clientId: matchingClient.id,
          content: replyDraft.trim()
        })
      });

      const responseBody = (await response.json().catch(() => null)) as
        | { error?: string; deliveryMode?: "chatwoot" | "local" }
        | null;

      if (!response.ok) {
        throw new Error(responseBody?.error ?? "No se pudo responder la conversación");
      }

      await refreshOperationalViews(selectedTenantId);
      const nextDetail = await loadConversationDetail(
        supabase,
        selectedTenantId,
        conversationDetail.conversation.id
      );
      setConversationDetail(nextDetail);
      setReplyDraft("");
      setNotice(
        responseBody?.deliveryMode === "chatwoot"
          ? "Respuesta enviada a Chatwoot y guardada en la conversación."
          : "Respuesta guardada en la conversación. Falta configurar Chatwoot para envío real."
      );
    } catch (error) {
      setErrorMessage(formatErrorMessage(error));
    } finally {
      setSendingReply(false);
    }
  }

  function useConversationForOrder() {
    if (!conversationDetail || !selectedTenantId) {
      return;
    }

    const matchingClient = clientOptions.find(
      (client) => client.phone === conversationDetail.conversation.client?.phone
    );

    if (!matchingClient) {
      setErrorMessage("No se pudo vincular el cliente de la conversación al creador de pedidos.");
      return;
    }

    setSelectedClientId(matchingClient.id);
    setOrderNotes(
      `Pedido originado desde conversación ${conversationDetail.conversation.source_conversation_id ?? conversationDetail.conversation.id}`
    );
    setNotice("Cliente y notas del pedido precargados desde la conversación.");
  }

  function applyQuickReply(template: string) {
    setReplyDraft(template);
    replyInputRef.current?.focus();
  }

  async function handleAssignedToSave() {
    if (!supabase || !selectedTenantId || !conversationDetail) {
      return;
    }

    setSavingAssignee(true);
    setErrorMessage(null);
    setNotice(null);

    try {
      const { error } = await supabase
        .from("conversations")
        .update({
          assigned_to: assignedToDraft.trim() || null
        })
        .eq("tenant_id", selectedTenantId)
        .eq("id", conversationDetail.conversation.id);

      if (error) {
        throw error;
      }

      await refreshOperationalViews(selectedTenantId);
      const nextDetail = await loadConversationDetail(
        supabase,
        selectedTenantId,
        conversationDetail.conversation.id
      );
      setConversationDetail(nextDetail);
      setNotice("Asignación actualizada.");
    } catch (error) {
      setErrorMessage(formatErrorMessage(error));
    } finally {
      setSavingAssignee(false);
    }
  }

  async function handleConversationStatusSave(conversationId: string) {
    if (!supabase || !selectedTenantId) {
      return;
    }

    setUpdatingConversationId(conversationId);
    setErrorMessage(null);
    setNotice(null);

    try {
      const { error } = await supabase
        .from("conversations")
        .update({
          status: conversationStatusDrafts[conversationId] ?? "open"
        })
        .eq("tenant_id", selectedTenantId)
        .eq("id", conversationId);

      if (error) {
        throw error;
      }

      await refreshOperationalViews(selectedTenantId);

      if (selectedConversationId === conversationId) {
        const nextDetail = await loadConversationDetail(supabase, selectedTenantId, conversationId);
        setConversationDetail(nextDetail);
      }

      setNotice("Estado de conversación actualizado.");
    } catch (error) {
      setErrorMessage(formatErrorMessage(error));
    } finally {
      setUpdatingConversationId(null);
    }
  }

  if (loadingSession || !supabase) {
    return (
      <main className="shell">
        <section className="hero">
          <div className="hero-top">
            <div className="hero-copy">
              <span className="badge">Acceso seguro</span>
              <h1>Cargando sesión y permisos del negocio.</h1>
              <p className="muted">La app valida acceso y permisos antes de mostrar datos.</p>
            </div>
            <div className="hero-panel">
              <p className="eyebrow">Estado</p>
              <div className="hero-stat-grid">
                <div className="hero-stat">
                  <span>Autenticación</span>
                  <strong>Verificando</strong>
                </div>
                <div className="hero-stat">
                  <span>Permisos</span>
                  <strong>Seguridad activa</strong>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="shell">
        <section className="hero auth-hero">
          <div className="hero-copy">
            <span className="badge">Multiusuario real</span>
            <h1>Ingresá con tu cuenta y operá solo los negocios permitidos.</h1>
            <p>
              Todo entra por acceso autenticado, permisos por negocio y aislamiento seguro de datos.
            </p>
            <div className="hero-stat-grid">
              <div className="hero-stat">
                <span>Canal principal</span>
                <strong>WhatsApp</strong>
              </div>
              <div className="hero-stat">
                <span>Modelo</span>
                <strong>CRM operativo</strong>
              </div>
              <div className="hero-stat">
                <span>Aislamiento</span>
                <strong>Negocio + seguridad</strong>
              </div>
            </div>
          </div>

          <form className="auth-card" onSubmit={handleAuthSubmit}>
            <div className="auth-tabs">
              <button
                className={authMode === "login" ? "button button-primary" : "button button-secondary"}
                onClick={() => setAuthMode("login")}
                type="button"
              >
                Iniciar sesión
              </button>
              <button
                className={authMode === "signup" ? "button button-primary" : "button button-secondary"}
                onClick={() => setAuthMode("signup")}
                type="button"
              >
                Crear cuenta
              </button>
            </div>

            {authMode === "signup" ? (
              <label className="field">
                <span>Nombre</span>
                <input
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Juan Perez"
                  value={fullName}
                />
              </label>
            ) : null}

            <label className="field">
              <span>Email</span>
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="equipo@negocio.com"
                type="email"
                value={email}
              />
            </label>

            <label className="field">
              <span>Contraseña</span>
              <input
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
                minLength={6}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimo 6 caracteres"
                type="password"
                value={password}
              />
            </label>

            <button className="button button-primary button-block" type="submit">
              {authMode === "login" ? "Entrar" : "Crear cuenta"}
            </button>

            {notice ? <p className="notice">{notice}</p> : null}
            {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-top">
          <div className="hero-copy">
            <span className="badge">Centro de control</span>
            <h1>Operacion comercial, conversaciones y pedidos en una sola superficie.</h1>
            <p>
              Vista de mando para bandeja, clientes y stock con lectura por prioridad, escritura
              protegida y contexto por negocio en tiempo real.
            </p>
            <div className="hero-stat-grid">
              <div className="hero-stat">
                <span>Espacio</span>
                <strong>{activeMembership?.tenant?.name ?? "Sin negocio"}</strong>
              </div>
              <div className="hero-stat">
                <span>Permiso</span>
                <strong>{activeMembership ? getRoleLabel(activeMembership.role) : "Sin acceso"}</strong>
              </div>
              <div className="hero-stat">
                <span>Atencion</span>
                <strong>{data.stats.activeConversations} activas</strong>
              </div>
            </div>
          </div>
          <div className="hero-panel">
            <p className="eyebrow">Mesa activa</p>
            <div className="hero-actions">
              <a className="button button-primary" href={chatwootAppUrl}>
                Abrir bandeja
              </a>
              <a className="button button-secondary" href="#resumen">
                Ver resumen
              </a>
            </div>
            <div className="hero-panel-copy">
              <p>
                Sesión activa: <strong>{session.user.email}</strong>
              </p>
              <p>
                {activeMembership?.tenant
                  ? `Negocio activo: ${activeMembership.tenant.name} (${activeMembership.tenant.slug})`
                  : "Sin negocio activo"}
              </p>
              <p>
                Pipeline: <strong>{attentionOrders.length}</strong> pedidos operables ·{" "}
                <strong>{criticalProducts.length}</strong> alertas de stock
              </p>
            </div>
          </div>
        </div>
        <div className="session-row">
          <div className="session-pills">
            <span className="subtle-pill">Usuario: {session.user.email}</span>
            {activeMembership ? <span className="subtle-pill">Rol: {getRoleLabel(activeMembership.role)}</span> : null}
          </div>
          <button className="button button-secondary" onClick={handleSignOut} type="button">
            Cerrar sesión
          </button>
        </div>
        {notice ? <p className="notice">{notice}</p> : null}
        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      </section>

      <section className="card tenant-switcher tenant-switcher-card">
        <div>
          <h2 className="section-title">Negocios disponibles</h2>
          <p className="section-copy">
            Cada vista se filtra según tus accesos y permisos por negocio.
          </p>
        </div>
        <div className="tenant-list">
          {memberships.length === 0 ? (
            <p className="empty">Todavía no tenés accesos cargados.</p>
          ) : (
            memberships.map((membership) => (
              <button
                className={
                  membership.tenant_id === selectedTenantId ? "tenant-pill tenant-pill-active" : "tenant-pill"
                }
                key={membership.tenant_id}
                onClick={() => setSelectedTenantId(membership.tenant_id)}
                type="button"
              >
                {membership.tenant?.name ?? membership.tenant_id}
                <span>{getRoleLabel(membership.role)}</span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="whatsapp-grid">
        <article className="card whatsapp-stage">
          <div className="section-header">
            <div>
              <p className="eyebrow eyebrow-light">Modo operativo</p>
              <h2 className="section-title">Centro de control WhatsApp</h2>
              <p className="section-copy">
                La atención vive en Chatwoot; el dashboard concentra prioridades comerciales,
                stock y ejecución rápida.
              </p>
            </div>
            <span className="chip">Centrado en WhatsApp</span>
          </div>
          <div className="control-strip">
            <div className="control-tile">
              <span>Bandeja</span>
              <strong>Responder en Chatwoot</strong>
              <p>Atendé conversaciones, asigná agentes y seguí contexto del cliente.</p>
            </div>
            <div className="control-tile">
              <span>Clientes</span>
              <strong>Resolver cliente y pedido</strong>
              <p>El webhook ya sincroniza mensaje, conversación y borrador comercial.</p>
            </div>
            <div className="control-tile">
              <span>Operación</span>
              <strong>Confirmar, reservar, cerrar</strong>
              <p>Usá este panel para pasar de conversación a pedido y de pedido a stock.</p>
            </div>
          </div>
        </article>

        <article className="card rail-card">
          <p className="eyebrow eyebrow-light">Qué probar</p>
          <label className="field">
            <span>Simular mensaje de WhatsApp</span>
            <input
              onChange={(event) => setSimulationContent(event.target.value)}
              placeholder="Quiero comprar 2 boxes premium hoy"
              value={simulationContent}
            />
          </label>
          <button
            className="button button-primary button-block"
            disabled={simulatingWhatsapp || !selectedTenantId || simulationContent.trim().length === 0}
            onClick={() => void handleWhatsappSimulation()}
            type="button"
          >
            {simulatingWhatsapp ? "Simulando..." : "Simular WhatsApp"}
          </button>
          <div className="rail-list">
            <div className="rail-item">
              <strong>Abrí Chatwoot</strong>
              <p>Usá “Abrir bandeja” para atender desde la inbox real.</p>
            </div>
            <div className="rail-item">
              <strong>Simulá intención de compra</strong>
              <p>Mandá un mensaje con “quiero”, “comprar” o “precio” para disparar borrador.</p>
            </div>
            <div className="rail-item">
              <strong>Confirmá en dashboard</strong>
              <p>Validá cliente, stock y estado del pedido sin salir del negocio activo.</p>
            </div>
          </div>
        </article>
      </section>

      <section className="card card-accent">
        <div className="section-header">
          <div>
            <h2 className="section-title">Equipo del negocio</h2>
            <p className="section-copy">
              {membershipAdminEnabled
                ? "Titulares y administradores pueden asignar accesos por email sobre el negocio activo."
                : "Solo titulares y administradores pueden administrar accesos desde esta vista."}
            </p>
          </div>
          {activeMembership ? <span className="chip">Tu rol: {getRoleLabel(activeMembership.role)}</span> : null}
        </div>

        {membershipAdminEnabled ? (
          <>
            <form className="member-form" onSubmit={handleMembershipSubmit}>
              <label className="field">
                <span>Email del usuario</span>
                <input
                  autoComplete="email"
                  onChange={(event) => setMemberEmail(event.target.value)}
                  placeholder="persona@negocio.com"
                  type="email"
                  value={memberEmail}
                />
              </label>

              <label className="field">
                <span>Rol</span>
                <select
                  onChange={(event) => setMemberRole(event.target.value as TenantMembership["role"])}
                  value={memberRole}
                >
                  {membershipRoleOptions.map((roleOption) => (
                    <option key={roleOption} value={roleOption}>
                      {getRoleLabel(roleOption)}
                    </option>
                  ))}
                </select>
              </label>

              <button
                className="button button-primary"
                disabled={membershipActionPending || memberEmail.trim().length === 0}
                type="submit"
              >
                {membershipActionPending ? "Guardando..." : "Agregar o actualizar"}
              </button>
            </form>

            <div className="list member-list">
              {loadingDirectory ? (
                <p className="empty">Cargando miembros del negocio...</p>
              ) : directoryEntries.length === 0 ? (
                <p className="empty">Todavía no hay accesos visibles para este negocio.</p>
              ) : (
                directoryEntries.map((entry) => (
                  <div className="row member-row" key={entry.membership_id}>
                    <div>
                      <p className="row-title">{entry.full_name ?? "Usuario sin nombre"}</p>
                      <p className="row-copy">
                        {entry.email} · Alta {formatDate(entry.created_at)}
                      </p>
                    </div>
                    <div className="member-actions">
                      <span className="chip">{getRoleLabel(entry.role)}</span>
                      <button
                        className="button button-secondary"
                        disabled={membershipActionPending}
                        onClick={() => void handleMembershipDelete(entry)}
                        type="button"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <p className="empty">
            Cambiá al negocio donde seas titular o administrador para gestionar accesos del equipo.
          </p>
        )}
      </section>

      <section className="sections sections-ops">
        <article className="card card-soft">
          <div className="section-header">
            <div>
              <h2 className="section-title">Productos</h2>
              <p className="section-copy">
                Alta y edición rápida del catálogo bajo permisos de titular o administrador.
              </p>
            </div>
            {productAdminEnabled ? (
              <span className="chip">{productForm.id ? "Editando producto" : "Nuevo producto"}</span>
            ) : null}
          </div>

          {productAdminEnabled ? (
            <form className="member-form" onSubmit={handleProductSubmit}>
              <label className="field">
                <span>Nombre</span>
                <input
                  onChange={(event) =>
                    setProductForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Box Regalo Premium"
                  value={productForm.name}
                />
              </label>

              <label className="field">
                <span>SKU</span>
                <input
                  onChange={(event) =>
                    setProductForm((current) => ({ ...current, sku: event.target.value }))
                  }
                  placeholder="BOX-PREMIUM"
                  value={productForm.sku}
                />
              </label>

              <label className="field">
                <span>Precio</span>
                <input
                  min="0"
                  onChange={(event) =>
                    setProductForm((current) => ({ ...current, price: event.target.value }))
                  }
                  step="0.01"
                  type="number"
                  value={productForm.price}
                />
              </label>

              <label className="field">
                <span>Moneda</span>
                <input
                  maxLength={3}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      currency: event.target.value.toUpperCase()
                    }))
                  }
                  value={productForm.currency}
                />
              </label>

              <label className="field">
                <span>Stock disponible</span>
                <input
                  min="0"
                  onChange={(event) =>
                    setProductForm((current) => ({ ...current, stockOnHand: event.target.value }))
                  }
                  type="number"
                  value={productForm.stockOnHand}
                />
              </label>

              <label className="field">
                <span>Stock mínimo</span>
                <input
                  min="0"
                  onChange={(event) =>
                    setProductForm((current) => ({ ...current, stockMinimum: event.target.value }))
                  }
                  type="number"
                  value={productForm.stockMinimum}
                />
              </label>

              <label className="field field-wide">
                <span>Descripción</span>
                <input
                  onChange={(event) =>
                    setProductForm((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="Detalle corto para el operador"
                  value={productForm.description}
                />
              </label>

              <label className="field checkbox-field">
                <span>Activo</span>
                <input
                  checked={productForm.isActive}
                  onChange={(event) =>
                    setProductForm((current) => ({ ...current, isActive: event.target.checked }))
                  }
                  type="checkbox"
                />
              </label>

              <div className="member-actions">
                <button className="button button-primary" disabled={savingProduct} type="submit">
                  {savingProduct ? "Guardando..." : productForm.id ? "Actualizar producto" : "Crear producto"}
                </button>
                {productForm.id ? (
                  <button
                    className="button button-secondary"
                    onClick={resetProductForm}
                    type="button"
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>
            </form>
          ) : (
            <p className="empty">Necesitás rol titular o administrador para editar el catálogo.</p>
          )}
        </article>

        <article className="card card-soft">
          <div className="section-header">
            <div>
              <h2 className="section-title">Pedidos manuales</h2>
              <p className="section-copy">
                Creá pedidos rápidos para clientes existentes y dejá reservado el stock por estado.
              </p>
            </div>
            {orderWriteEnabled ? <span className="chip">Carga manual</span> : null}
          </div>

          {orderWriteEnabled ? (
            <form className="order-form" onSubmit={handleOrderSubmit}>
              <label className="field">
                <span>Cliente</span>
                <select onChange={(event) => setSelectedClientId(event.target.value)} value={selectedClientId}>
                  <option value="">Seleccionar cliente</option>
                  {clientOptions.map((client) => (
                    <option key={client.id} value={client.id}>
                      {(client.full_name ?? "Cliente sin nombre") + " · " + client.phone}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Estado inicial</span>
                <select
                  onChange={(event) =>
                    setOrderStatus(event.target.value as (typeof orderStatusOptions)[number])
                  }
                  value={orderStatus}
                >
                  {orderStatusOptions.map((statusOption) => (
                    <option key={statusOption} value={statusOption}>
                      {getOrderStatusLabel(statusOption)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field field-wide">
                <span>Notas</span>
                <input
                  onChange={(event) => setOrderNotes(event.target.value)}
                  placeholder="Observaciones del pedido"
                  value={orderNotes}
                />
              </label>

              <div className="order-items">
                {orderItems.map((item, index) => (
                  <div className="order-item-row" key={`${index}-${item.productId}`}>
                    <label className="field">
                      <span>Producto</span>
                      <select
                        onChange={(event) => updateOrderItem(index, { productId: event.target.value })}
                        value={item.productId}
                      >
                        <option value="">Seleccionar producto</option>
                        {productOptions
                          .filter((product) => product.is_active)
                          .map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name} · {product.sku}
                            </option>
                          ))}
                      </select>
                    </label>

                    <label className="field">
                      <span>Cantidad</span>
                      <input
                        min="1"
                        onChange={(event) => updateOrderItem(index, { quantity: event.target.value })}
                        type="number"
                        value={item.quantity}
                      />
                    </label>

                    <button
                      className="button button-secondary"
                      disabled={orderItems.length === 1}
                      onClick={() =>
                        setOrderItems((currentItems) =>
                          currentItems.length === 1
                            ? currentItems
                            : currentItems.filter((_, itemIndex) => itemIndex !== index)
                        )
                      }
                      type="button"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>

              <div className="member-actions">
                <button
                  className="button button-secondary"
                  onClick={() => setOrderItems((currentItems) => [...currentItems, emptyOrderItem()])}
                  type="button"
                >
                  Agregar item
                </button>
                <button
                  className="button button-primary"
                  disabled={savingOrder || !selectedClientId}
                  type="submit"
                >
                  {savingOrder ? "Creando..." : "Crear pedido"}
                </button>
              </div>
            </form>
          ) : (
            <p className="empty">Necesitás rol titular, administrador o agente para crear pedidos.</p>
          )}
        </article>
      </section>

      <section className="metrics command-deck" id="resumen">
        <article className="card metric-card deck-card">
          <p className="metric-label">Clientes</p>
          <p className="metric-value">{loadingData ? "..." : data.stats.clients}</p>
          <div className="metric-footnote">Contactos activos del negocio.</div>
        </article>
        <article className="card metric-card deck-card">
          <p className="metric-label">Conversaciones</p>
          <p className="metric-value">{loadingData ? "..." : data.stats.activeConversations}</p>
          <div className="metric-footnote">Bandejas abiertas o pendientes.</div>
        </article>
        <article className="card metric-card deck-card">
          <p className="metric-label">Pedidos</p>
          <p className="metric-value">{loadingData ? "..." : data.stats.pendingOrders}</p>
          <div className="metric-footnote">Borradores o pedidos en curso.</div>
        </article>
        <article className="card metric-card deck-card">
          <p className="metric-label">Stock crítico</p>
          <p className="metric-value">{loadingData ? "..." : data.stats.lowStockProducts}</p>
          <div className="metric-footnote">Productos cerca del mínimo.</div>
        </article>
      </section>

      <section className="sections command-section">
        <article className="card card-soft radar-card">
          <div className="section-header">
            <div>
              <h2 className="section-title">Radar comercial</h2>
              <p className="section-copy">
                Prioridades rápidas para operar como dueño desde WhatsApp + panel.
              </p>
            </div>
            <span className="chip">{attentionOrders.length} pedidos activos</span>
          </div>
          <div className="signal-grid deck-grid">
            <div className="signal-card">
              <span>Clientes calientes</span>
              <strong>{priorityClients.length}</strong>
              <p>Últimos contactos sincronizados para seguimiento inmediato.</p>
            </div>
            <div className="signal-card">
              <span>Pedidos en curso</span>
              <strong>{attentionOrders.length}</strong>
              <p>Borrador, confirmado o pagado, listos para mover desde esta pantalla.</p>
            </div>
            <div className="signal-card">
              <span>Stock crítico</span>
              <strong>{criticalProducts.length}</strong>
              <p>Productos que pueden frenar ventas por WhatsApp.</p>
            </div>
          </div>
        </article>

        <article className="card card-soft playbook-card">
          <div className="section-header">
            <div>
              <h2 className="section-title">Guía de prueba</h2>
              <p className="section-copy">
                Secuencia corta para empezar a operar el MVP desde WhatsApp sin adivinar el flujo.
              </p>
            </div>
          </div>
          <div className="playbook">
            <div className="playbook-step">
              <span>01</span>
              <div>
                <strong>Cliente escribe por WhatsApp</strong>
                <p>El mensaje entra a Chatwoot y el webhook lo persiste en Supabase.</p>
              </div>
            </div>
            <div className="playbook-step">
              <span>02</span>
              <div>
                <strong>Operador responde desde Chatwoot</strong>
                <p>Usá la bandeja como centro conversacional, no este dashboard.</p>
              </div>
            </div>
            <div className="playbook-step">
              <span>03</span>
              <div>
                <strong>CMR crea borrador y datos</strong>
                <p>Cliente, conversación, mensaje y pedido borrador quedan visibles por negocio.</p>
              </div>
            </div>
            <div className="playbook-step">
              <span>04</span>
              <div>
                <strong>Confirmás desde el panel</strong>
                <p>Actualizá pedido, catálogo o stock según la conversación comercial.</p>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="card card-soft orders-desk">
        <div className="section-header">
          <div>
            <h2 className="section-title">Pedidos recientes</h2>
            <p className="section-copy">
              Visibles según tus permisos. La escritura queda reservada a titular, administrador y agente.
            </p>
          </div>
          <span className="chip">{data.orders.length} visibles</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Estado</th>
              <th>Total</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {data.orders.length === 0 ? (
              <tr>
                <td className="empty" colSpan={4}>
                  Todavía no hay pedidos.
                </td>
              </tr>
            ) : (
              data.orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.client?.full_name ?? "Cliente sin nombre"}</strong>
                    <div className="muted">{order.client?.phone ?? "Sin teléfono"}</div>
                  </td>
                  <td>
                    {orderWriteEnabled ? (
                      <select
                        onChange={(event) =>
                          setOrderStatusDrafts((current) => ({
                            ...current,
                            [order.id]: event.target.value
                          }))
                        }
                        value={orderStatusDrafts[order.id] ?? order.status}
                      >
                        {orderStatusOptions.map((statusOption) => (
                          <option key={statusOption} value={statusOption}>
                            {getOrderStatusLabel(statusOption)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      order.status
                    )}
                  </td>
                  <td>{formatMoney(order.total_amount, order.currency)}</td>
                  <td>
                    {orderWriteEnabled ? (
                      <button
                        className="button button-secondary"
                        disabled={updatingOrderId === order.id}
                        onClick={() => void handleOrderStatusSave(order.id)}
                        type="button"
                      >
                        {updatingOrderId === order.id ? "Guardando..." : "Guardar"}
                      </button>
                    ) : (
                      <span className="muted">Solo lectura</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="sections conversation-layout">
        <div className="stack inbox-column">
          <article className="card card-soft inbox-card">
            <div className="section-header">
              <div>
                <h2 className="section-title">Conversaciones recientes</h2>
                <p className="section-copy">
                  Bandeja resumida para filtrar conversaciones y actuar rápido por estado.
                </p>
              </div>
              <span className="chip">{visibleConversations.length} visibles</span>
            </div>
            <div className="toolbar-row">
              <label className="field toolbar-search">
                <span>Buscar conversación</span>
                <input
                  onChange={(event) => setConversationSearch(event.target.value)}
                  placeholder="Buscar por cliente, telefono, estado o referencia"
                  ref={conversationSearchRef}
                  value={conversationSearch}
                />
              </label>
              <div className="shortcut-strip">
                <span className="shortcut-pill">/ buscar</span>
                <span className="shortcut-pill">J/K mover</span>
                <span className="shortcut-pill">R responder</span>
                <span className="shortcut-pill">1-3 estado</span>
              </div>
            </div>
            <div className="filter-bar">
              <button
                className={conversationFilter === "all" ? "tenant-pill tenant-pill-active" : "tenant-pill"}
                onClick={() => setConversationFilter("all")}
                type="button"
              >
                Todas
              </button>
              <button
                className={conversationFilter === "open" ? "tenant-pill tenant-pill-active" : "tenant-pill"}
                onClick={() => setConversationFilter("open")}
                type="button"
              >
                Abiertas
              </button>
              <button
                className={
                  conversationFilter === "with-order" ? "tenant-pill tenant-pill-active" : "tenant-pill"
                }
                onClick={() => setConversationFilter("with-order")}
                type="button"
              >
                Con pedido
              </button>
              <button
                className={
                  conversationFilter === "without-order" ? "tenant-pill tenant-pill-active" : "tenant-pill"
                }
                onClick={() => setConversationFilter("without-order")}
                type="button"
              >
                Sin pedido
              </button>
              <button
                className={
                  conversationFilter === "awaiting-reply"
                    ? "tenant-pill tenant-pill-active"
                    : "tenant-pill"
                }
                onClick={() => setConversationFilter("awaiting-reply")}
                type="button"
              >
                Sin responder
              </button>
            </div>
            <table className="table inbox-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Canal</th>
                  <th>Señales</th>
                  <th>SLA</th>
                  <th>Último movimiento</th>
                  <th>Acción</th>
                </tr>
              </thead>
              {visibleConversations.length === 0 ? (
                <tbody>
                  <tr>
                    <td className="empty" colSpan={7}>
                      No hay conversaciones para este filtro.
                    </td>
                  </tr>
                </tbody>
              ) : (
                groupedConversations.map((group) => (
                  <tbody key={group.title}>
                    <tr className="table-group-row">
                      <td colSpan={7}>
                        <span className="table-group-label">{group.title}</span>
                      </td>
                    </tr>
                    {group.items.map((conversation) => (
                      <tr
                        className={
                          selectedConversationId === conversation.id ? "table-row-active" : undefined
                        }
                        key={conversation.id}
                      >
                        <td>
                          <strong>{conversation.client?.full_name ?? "Cliente sin nombre"}</strong>
                          <div className="muted">{conversation.client?.phone ?? "Sin teléfono"}</div>
                        </td>
                        <td>
                          <select
                            onChange={(event) =>
                              setConversationStatusDrafts((current) => ({
                                ...current,
                                [conversation.id]: event.target.value
                              }))
                            }
                            value={conversationStatusDrafts[conversation.id] ?? conversation.status}
                          >
                            {conversationStatusOptions.map((statusOption) => (
                              <option key={statusOption} value={statusOption}>
                                {getConversationStatusLabel(statusOption)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>{conversation.channel}</td>
                        <td>
                          <div className="member-actions">
                            {conversation.is_new_client ? (
                              <span className={conversationSignalChip("new-client")}>Cliente nuevo</span>
                            ) : null}
                            {!conversation.has_order ? (
                              <span className={conversationSignalChip("no-order")}>Sin pedido</span>
                            ) : null}
                            {conversation.order_status === "draft" ? (
                              <span className={conversationSignalChip("draft-order")}>Pedido draft</span>
                            ) : null}
                            {conversation.awaiting_reply ? (
                              <span className={conversationSignalChip("unanswered")}>Sin responder</span>
                            ) : (
                              <span className={conversationSignalChip("replied")}>Respondida por equipo</span>
                            )}
                            {conversation.unread_count > 0 ? (
                              <span className="chip chip-danger">{conversation.unread_count} sin leer</span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <span className={getSlaChip(conversation.sla_bucket)}>
                            {conversation.sla_bucket === "breach"
                              ? "SLA roto"
                              : conversation.sla_bucket === "warning"
                                ? "SLA atento"
                                : "SLA en tiempo"}
                          </span>
                        </td>
                        <td>{formatDate(conversation.last_message_at)}</td>
                        <td>
                          <div className="member-actions">
                            <button
                              className="button button-secondary"
                              onClick={() => setSelectedConversationId(conversation.id)}
                              type="button"
                            >
                              Ver detalle
                            </button>
                            <button
                              className="button button-secondary"
                              disabled={updatingConversationId === conversation.id}
                              onClick={() => void handleConversationStatusSave(conversation.id)}
                              type="button"
                            >
                              {updatingConversationId === conversation.id ? "Guardando..." : "Guardar"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))
              )}
            </table>
          </article>

          <article className="card card-soft">
            <h2 className="section-title">Clientes recientes</h2>
            <p className="section-copy">
              Contactos visibles según tus permisos del negocio activo.
            </p>
            <div className="list">
              {data.clients.length === 0 ? (
                <p className="empty">Todavía no hay clientes sincronizados.</p>
              ) : (
                data.clients.map((client) => (
                  <div className="row" key={client.id}>
                    <div>
                      <p className="row-title">{client.full_name ?? "Cliente sin nombre"}</p>
                      <p className="row-copy">
                        {client.phone}
                        {client.tags.length > 0 ? ` · ${client.tags.join(", ")}` : ""}
                      </p>
                    </div>
                    <span className="chip">{formatDate(client.last_interaction_at)}</span>
                  </div>
                ))
              )}
            </div>
          </article>

        </div>

        <article className="card card-soft conversation-detail-card workspace-card">
          <div className="section-header">
            <div>
              <h2 className="section-title">Detalle de conversación</h2>
              <p className="section-copy">
                Vista interna para revisar mensajes y contexto comercial sin salir de CMR.
              </p>
            </div>
            {conversationDetail ? <span className="chip">{conversationDetail.conversation.status}</span> : null}
          </div>
          {loadingConversation ? (
            <p className="empty">Cargando conversación...</p>
          ) : !conversationDetail ? (
            <p className="empty">Seleccioná una conversación para ver el detalle.</p>
          ) : (
            <>
              <div className="workspace-toolbar">
                <span className="shortcut-pill">Ctrl/Cmd + Enter enviar</span>
                <span className="shortcut-pill">1 abierta</span>
                <span className="shortcut-pill">2 pendiente</span>
                <span className="shortcut-pill">3 resuelta</span>
                <span className="shortcut-pill">Envio real si Chatwoot esta configurado</span>
              </div>
              <div className="conversation-meta">
                <div className="signal-card">
                  <span>Cliente</span>
                  <strong>{conversationDetail.conversation.client?.full_name ?? "Cliente sin nombre"}</strong>
                  <p>{conversationDetail.conversation.client?.phone ?? "Sin teléfono"}</p>
                </div>
                <div className="signal-card">
                  <span>Canal y origen</span>
                  <strong>
                    {conversationDetail.conversation.channel} · {conversationDetail.conversation.source}
                  </strong>
                  <p>
                    Ref {conversationDetail.conversation.source_conversation_id ?? "sin referencia"}
                  </p>
                </div>
                <div className="signal-card">
                  <span>Pedido vinculado</span>
                  <strong>
                    {conversationDetail.order
                      ? formatMoney(
                          conversationDetail.order.total_amount,
                          conversationDetail.order.currency
                        )
                      : "Sin pedido"}
                  </strong>
                  <p>
                    {conversationDetail.order
                      ? `Estado ${getOrderStatusLabel(conversationDetail.order.status)}`
                      : "Todavía no hay pedido ligado a esta conversación"}
                  </p>
                </div>
                <div className="signal-card">
                  <span>Badges</span>
                  <div className="member-actions">
                    {conversationDetail.conversation.is_new_client ? (
                      <span className={conversationSignalChip("new-client")}>Cliente nuevo</span>
                    ) : null}
                    {!conversationDetail.conversation.has_order ? (
                      <span className={conversationSignalChip("no-order")}>Sin pedido</span>
                    ) : null}
                    {conversationDetail.conversation.order_status === "draft" ? (
                      <span className={conversationSignalChip("draft-order")}>Pedido draft</span>
                    ) : null}
                    {conversationDetail.conversation.awaiting_reply ? (
                      <span className={conversationSignalChip("unanswered")}>Sin responder</span>
                    ) : (
                      <span className={conversationSignalChip("replied")}>Respondida por equipo</span>
                    )}
                    {!conversationDetail.conversation.awaiting_reply ? (
                      <span className={conversationSignalChip("awaiting-client")}>
                        Esperando respuesta del cliente
                      </span>
                    ) : null}
                    {conversationDetail.conversation.unread_count > 0 ? (
                      <span className="chip chip-danger">
                        {conversationDetail.conversation.unread_count} sin leer
                      </span>
                    ) : null}
                    <span className={getSlaChip(conversationDetail.conversation.sla_bucket)}>
                      {conversationDetail.conversation.sla_bucket === "breach"
                        ? "SLA roto"
                        : conversationDetail.conversation.sla_bucket === "warning"
                          ? "SLA atento"
                          : "SLA en tiempo"}
                    </span>
                  </div>
                </div>
                <div className="signal-card">
                  <span>Asignación</span>
                  <strong>{conversationDetail.conversation.assigned_to ?? "Sin asignar"}</strong>
                  <div className="inline-form">
                    <select
                      onChange={(event) => setAssignedToDraft(event.target.value)}
                      value={assignedToDraft}
                    >
                      <option value="">Sin asignar</option>
                      {assignablePeople.map((person) => (
                        <option key={person.value} value={person.value}>
                          {person.label}
                        </option>
                      ))}
                    </select>
                    <button
                      className="button button-secondary"
                      disabled={savingAssignee}
                      onClick={() => void handleAssignedToSave()}
                      type="button"
                    >
                      {savingAssignee ? "Guardando..." : "Asignar"}
                    </button>
                  </div>
                </div>
                <div className="signal-card">
                  <span>Estado rápido</span>
                  <strong>{conversationDetail.conversation.status}</strong>
                  <div className="member-actions">
                    {conversationStatusOptions.map((statusOption) => (
                      <button
                        className="button button-secondary"
                        key={statusOption}
                        onClick={() =>
                          setConversationStatusDrafts((current) => ({
                            ...current,
                            [conversationDetail.conversation.id]: statusOption
                          }))
                        }
                        type="button"
                      >
                        {getConversationStatusLabel(statusOption)}
                      </button>
                    ))}
                    <button
                      className="button button-primary"
                      disabled={updatingConversationId === conversationDetail.conversation.id}
                      onClick={() =>
                        void handleConversationStatusSave(conversationDetail.conversation.id)
                      }
                      type="button"
                    >
                      {updatingConversationId === conversationDetail.conversation.id
                        ? "Guardando..."
                        : "Aplicar"}
                    </button>
                  </div>
                </div>
              </div>
              <div className="message-thread">
                {conversationDetail.messages.length === 0 ? (
                  <p className="empty">No hay mensajes sincronizados para esta conversación.</p>
                ) : (
                  conversationDetail.messages.map((message) => (
                    <div
                      className={
                        message.direction === "inbound"
                          ? "message-bubble message-inbound"
                          : "message-bubble message-outbound"
                      }
                      key={message.id}
                    >
                      <div className="message-meta">
                        <span>{message.direction === "inbound" ? "Cliente" : "Equipo"}</span>
                        <span>{formatDate(message.sent_at)}</span>
                      </div>
                      <p>{message.content ?? "(sin contenido)"}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="reply-composer">
                <div className="template-strip">
                  {quickReplyTemplates.map((template) => (
                    <button
                      className="button button-secondary template-pill"
                      key={template}
                      onClick={() => applyQuickReply(template)}
                      type="button"
                    >
                      {template}
                    </button>
                  ))}
                </div>
                <label className="field field-wide">
                  <span>Respuesta manual</span>
                  <input
                    onChange={(event) => setReplyDraft(event.target.value)}
                    placeholder="Escribí una respuesta para guardar en la conversación"
                    ref={replyInputRef}
                    value={replyDraft}
                  />
                </label>
                <div className="member-actions">
                  <button
                    className="button button-primary"
                    disabled={sendingReply || replyDraft.trim().length === 0 || !orderWriteEnabled}
                    onClick={() => void handleConversationReply()}
                    type="button"
                  >
                    {sendingReply ? "Guardando..." : "Guardar respuesta"}
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={useConversationForOrder}
                    type="button"
                  >
                    Usar para pedido
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="detail-divider" />

          <h2 className="section-title">Stock vigilado</h2>
          <p className="section-copy">
            Productos expuestos según el negocio activo. La edición de catálogo queda para titular y
            administrador.
          </p>
          <div className="list">
            {data.products.length === 0 ? (
              <p className="empty">No hay productos cargados todavía.</p>
            ) : (
              data.products.map((product) => {
                const available = product.stock_on_hand - product.stock_reserved;

                return (
                  <div className="row" key={product.id}>
                    <div>
                      <p className="row-title">
                        {product.name} <span className="muted">#{product.sku}</span>
                      </p>
                      <p className="row-copy">
                        Disponible {available} · Reservado {product.stock_reserved} ·{" "}
                        {formatMoney(product.price, product.currency)}
                      </p>
                    </div>
                    <div className="member-actions">
                      <span
                        className={stockChip(
                          product.stock_on_hand,
                          product.stock_reserved,
                          product.stock_minimum
                        )}
                      >
                        Min {product.stock_minimum}
                      </span>
                      {productAdminEnabled ? (
                        <button
                          className="button button-secondary"
                          onClick={() => startProductEdit(product)}
                          type="button"
                        >
                          Editar
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
