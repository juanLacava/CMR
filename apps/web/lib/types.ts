export type DashboardStats = {
  clients: number;
  activeConversations: number;
  pendingOrders: number;
  lowStockProducts: number;
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
  stock_on_hand: number;
  stock_reserved: number;
  stock_minimum: number;
  price: number;
  currency: string;
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
