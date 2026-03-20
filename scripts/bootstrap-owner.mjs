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

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60);
}

function printHelp() {
  console.log(`Usage:
  npm run bootstrap:owner -- --email user@example.com --tenant-name "Mi negocio" [--tenant-slug mi-negocio] [--full-name "Juan"]

What it does:
  - loads env vars from .env.local and apps/web/.env.local when present
  - finds an existing Supabase Auth user by email
  - creates the tenant if it does not exist
  - creates or reuses the owner membership
`);
}

async function findUserByEmail(supabase, email) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage
    });

    if (error) {
      throw error;
    }

    const users = data?.users ?? [];
    const user = users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());

    if (user) {
      return user;
    }

    if (users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help === "true" || args.h === "true") {
    printHelp();
    return;
  }

  loadEnvFile(path.join(cwd, ".env.local"));
  loadEnvFile(path.join(cwd, "apps/web/.env.local"));

  const email = args.email?.trim().toLowerCase();
  const tenantName = args["tenant-name"]?.trim();
  const tenantSlug = (args["tenant-slug"]?.trim() || slugify(tenantName || "")).toLowerCase();
  const fullName = args["full-name"]?.trim() || null;

  if (!email || !tenantName) {
    printHelp();
    throw new Error("Missing required args: --email and --tenant-name");
  }

  if (!tenantSlug) {
    throw new Error("Could not infer tenant slug. Pass --tenant-slug explicitly.");
  }

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const user = await findUserByEmail(supabase, email);

  if (!user) {
    throw new Error(`No auth user found for ${email}. Create the user first from the web UI.`);
  }

  if (fullName) {
    const { error: userUpdateError } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...(user.user_metadata ?? {}),
        full_name: fullName
      }
    });

    if (userUpdateError) {
      throw userUpdateError;
    }
  }

  const { data: existingTenant, error: tenantLookupError } = await supabase
    .from("tenants")
    .select("id, name, slug")
    .eq("slug", tenantSlug)
    .maybeSingle();

  if (tenantLookupError) {
    throw tenantLookupError;
  }

  let tenant = existingTenant;

  if (!tenant) {
    const { data: createdTenant, error: tenantInsertError } = await supabase
      .from("tenants")
      .insert({
        name: tenantName,
        slug: tenantSlug
      })
      .select("id, name, slug")
      .single();

    if (tenantInsertError) {
      throw tenantInsertError;
    }

    tenant = createdTenant;
  }

  const { data: existingMembership, error: membershipLookupError } = await supabase
    .from("tenant_memberships")
    .select("id, role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipLookupError) {
    throw membershipLookupError;
  }

  let membership = existingMembership;

  if (!membership) {
    const { data: createdMembership, error: membershipInsertError } = await supabase
      .from("tenant_memberships")
      .insert({
        tenant_id: tenant.id,
        user_id: user.id,
        role: "owner"
      })
      .select("id, role")
      .single();

    if (membershipInsertError) {
      throw membershipInsertError;
    }

    membership = createdMembership;
  }

  console.log(
    JSON.stringify(
      {
        email,
        userId: user.id,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        membershipId: membership.id,
        membershipRole: membership.role
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
