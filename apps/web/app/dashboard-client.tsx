"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

import { createBrowserSupabaseClient } from "../lib/supabase";
import type {
  ClientRow,
  DashboardData,
  DashboardStats,
  OrderRow,
  ProductRow,
  TenantMembership
} from "../lib/types";

type DashboardClientProps = {
  chatwootAppUrl: string;
};

const emptyData = (): DashboardData => ({
  stats: {
    clients: 0,
    activeConversations: 0,
    pendingOrders: 0,
    lowStockProducts: 0
  },
  clients: [],
  products: [],
  orders: []
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

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error";
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
    ordersResult
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
      .select("id, name, sku, stock_on_hand, stock_reserved, stock_minimum, price, currency")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("stock_on_hand", { ascending: true })
      .limit(8),
    supabase
      .from("orders")
      .select("id, status, total_amount, currency, created_at, client:clients(full_name, phone)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(8)
  ]);

  const errors = [
    clientsCountResult.error,
    activeConversationsCountResult.error,
    pendingOrdersCountResult.error,
    clientsResult.error,
    productsResult.error,
    ordersResult.error
  ].filter(Boolean);

  if (errors.length > 0) {
    throw errors[0];
  }

  const products = (productsResult.data ?? []) as ProductRow[];
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
    }))
  };
}

export function DashboardClient({ chatwootAppUrl }: DashboardClientProps) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData>(emptyData());
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setSupabase(createBrowserSupabaseClient());
  }, []);

  useEffect(() => {
    let ignore = false;

    if (!supabase) {
      return;
    }

    supabase.auth.getSession().then(({ data: sessionData, error }) => {
      if (ignore) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
      }

      setSession(sessionData.session);
      setLoadingSession(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
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
          setNotice("Tu usuario existe, pero todavía no tiene acceso a ningún tenant.");
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
        return;
      }

      setLoadingData(true);

      try {
        const nextData = await loadDashboard(supabase, selectedTenantId);

        if (!ignore) {
          setData(nextData);
          setErrorMessage(null);
        }
      } catch (error) {
        if (!ignore) {
          setData(emptyData());
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
  }

  const activeMembership =
    memberships.find((membership) => membership.tenant_id === selectedTenantId) ?? null;

  if (loadingSession || !supabase) {
    return (
      <main className="shell">
        <section className="hero">
          <span className="badge">Acceso seguro</span>
          <h1>Cargando sesión y permisos del tenant.</h1>
          <p className="muted">La app valida autenticación y roles antes de mostrar datos.</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="shell">
        <section className="hero auth-hero">
          <div>
            <span className="badge">Multiusuario real</span>
            <h1>Ingresá con tu cuenta y operá solo los tenants permitidos.</h1>
            <p>
              El dashboard ya no usa `service_role` para lectura. Todo entra por Supabase Auth,
              membresías por tenant y RLS.
            </p>
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
          <div>
            <span className="badge">WhatsApp-first CRM</span>
            <h1>Clientes, stock y pedidos bajo permisos por tenant.</h1>
          </div>
          <div className="hero-actions">
            <a className="button button-primary" href={chatwootAppUrl}>
              Abrir bandeja
            </a>
            <button className="button button-secondary" onClick={handleSignOut} type="button">
              Cerrar sesión
            </button>
          </div>
        </div>
        <p>
          Sesión activa: <strong>{session.user.email}</strong>
          {activeMembership ? ` · Rol ${activeMembership.role}` : ""}
        </p>
        <p className="muted">
          {activeMembership?.tenant
            ? `Tenant activo: ${activeMembership.tenant.name} (${activeMembership.tenant.slug})`
            : "Sin tenant activo"}
        </p>
        {notice ? <p className="notice">{notice}</p> : null}
        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      </section>

      <section className="card tenant-switcher">
        <div>
          <h2 className="section-title">Tenants del usuario</h2>
          <p className="section-copy">
            Cada vista está filtrada por membresías y Row Level Security.
          </p>
        </div>
        <div className="tenant-list">
          {memberships.length === 0 ? (
            <p className="empty">Todavía no tenés memberships cargadas.</p>
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
                <span>{membership.role}</span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="metrics" id="resumen">
        <article className="card">
          <p className="metric-label">Clientes</p>
          <p className="metric-value">{loadingData ? "..." : data.stats.clients}</p>
          <div className="metric-footnote">Contactos activos del tenant.</div>
        </article>
        <article className="card">
          <p className="metric-label">Conversaciones</p>
          <p className="metric-value">{loadingData ? "..." : data.stats.activeConversations}</p>
          <div className="metric-footnote">Bandejas abiertas o pendientes.</div>
        </article>
        <article className="card">
          <p className="metric-label">Pedidos</p>
          <p className="metric-value">{loadingData ? "..." : data.stats.pendingOrders}</p>
          <div className="metric-footnote">Borradores o pedidos en curso.</div>
        </article>
        <article className="card">
          <p className="metric-label">Stock crítico</p>
          <p className="metric-value">{loadingData ? "..." : data.stats.lowStockProducts}</p>
          <div className="metric-footnote">Productos cerca del mínimo.</div>
        </article>
      </section>

      <section className="sections">
        <div className="stack">
          <article className="card">
            <h2 className="section-title">Clientes recientes</h2>
            <p className="section-copy">
              Contactos visibles según tu membership del tenant activo.
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

          <article className="card">
            <h2 className="section-title">Pedidos recientes</h2>
            <p className="section-copy">
              Visibles por RLS. La escritura queda reservada a `owner`, `admin` y `agent`.
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.length === 0 ? (
                  <tr>
                    <td className="empty" colSpan={3}>
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
                      <td>{order.status}</td>
                      <td>{formatMoney(order.total_amount, order.currency)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </article>
        </div>

        <article className="card">
          <h2 className="section-title">Stock vigilado</h2>
          <p className="section-copy">
            Productos expuestos según tenant activo. La edición de catálogo queda para `owner` y
            `admin`.
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
                    <span
                      className={stockChip(
                        product.stock_on_hand,
                        product.stock_reserved,
                        product.stock_minimum
                      )}
                    >
                      Min {product.stock_minimum}
                    </span>
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
