export type DashboardStats = {
  clients: number;
  activeConversations: number;
  pendingOrders: number;
  lowStockProducts: number;
};

export type ConversationRow = {
  id: string;
  status: string;
  channel: string;
  source: string;
  source_conversation_id: string | null;
  last_message_at: string | null;
  assigned_to: string | null;
  has_order: boolean;
  awaiting_reply: boolean;
  unread_count: number;
  sla_bucket: "ok" | "warning" | "breach";
  order_status: string | null;
  is_new_client: boolean;
  client: {
    full_name: string | null;
    phone: string;
  } | null;
};

export type MessageRow = {
  id: string;
  direction: "inbound" | "outbound";
  content: string | null;
  content_type: string;
  sent_at: string;
};

export type ConversationDetail = {
  conversation: ConversationRow;
  messages: MessageRow[];
  order: {
    id: string;
    status: string;
    total_amount: number;
    currency: string;
  } | null;
};

export type ClientRow = {
  id: string;
  full_name: string | null;
  phone: string;
  tags: string[];
  last_interaction_at: string | null;
};

export type ProductRow = {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  stock_on_hand: number;
  stock_reserved: number;
  stock_minimum: number;
  price: number;
  currency: string;
  is_active: boolean;
};

export type OrderRow = {
  id: string;
  status: string;
  total_amount: number;
  currency: string;
  created_at: string;
  client: {
    full_name: string | null;
    phone: string;
  } | null;
};

export type DashboardData = {
  stats: DashboardStats;
  clients: ClientRow[];
  products: ProductRow[];
  orders: OrderRow[];
  conversations: ConversationRow[];
};

export type TenantMembership = {
  tenant_id: string;
  role: "owner" | "admin" | "agent" | "viewer";
  tenant: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

export type MembershipDirectoryEntry = {
  membership_id: string;
  user_id: string;
  role: TenantMembership["role"];
  created_at: string;
  full_name: string | null;
  email: string;
};
