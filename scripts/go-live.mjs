// Sets up and refreshes everything Beats by Say needs around the `beatsbysay` Cloudflare Worker.
// Every step checks first and only adds what's missing, so it's safe on every push to main.
//
//   node scripts/go-live.mjs pre    (before `wrangler deploy`)
//     1. Database: runs supabase/migrations/*.sql on the shared project (each file must be safe to re-run)
//     2. Supabase sign-in redirect URLs for the domain and the workers.dev address
//   node scripts/go-live.mjs post   (after `wrangler deploy`, once the Worker exists)
//     3. Worker secrets (GEMINI_API_KEY, TRIANGLE_LLM_URL, TRIANGLE_LLM_API_KEY), only when not set yet
//     4. When DOMAIN is set: Cloudflare zone, removal of the old Lovable records, Worker custom domains
//
// Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, WORKER,
//      optional DOMAIN, GEMINI_API_KEY, TRIANGLE_LLM_URL, TRIANGLE_LLM_API_KEY, OLD_IPS.

import { readdirSync, readFileSync } from "node:fs";

const phase = process.argv[2];
if (phase !== "pre" && phase !== "post") {
  console.error("Usage: node scripts/go-live.mjs pre|post");
  process.exit(2);
}

const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing ${k}`);
  return v;
};
const opt = (k) => process.env[k] || "";
const CF = "https://api.cloudflare.com/client/v4";
const cfToken = env("CLOUDFLARE_API_TOKEN");
const account = env("CLOUDFLARE_ACCOUNT_ID");
const worker = env("WORKER");
const domain = opt("DOMAIN").toLowerCase().replace(/^www\./, "");
// Lovable's hosting address; records pointing here are what the old site used.
const oldIps = (opt("OLD_IPS") || "185.158.133.1").split(",").map((s) => s.trim()).filter(Boolean);

async function cf(method, path, body) {
  const res = await fetch(CF + path, {
    method,
    headers: { Authorization: `Bearer ${cfToken}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok && data.success !== false, data };
}
const fail = (what, r) => {
  throw new Error(`${what} failed (${r.status}): ${JSON.stringify(r.data?.errors ?? r.data).slice(0, 400)}`);
};

async function workersDevHost() {
  const r = await cf("GET", `/accounts/${account}/workers/subdomain`);
  return r.ok && r.data.result?.subdomain ? `${worker}.${r.data.result.subdomain}.workers.dev` : "";
}

if (phase === "pre") {
  const ref = env("SUPABASE_PROJECT_REF");
  const sbToken = env("SUPABASE_ACCESS_TOKEN");
  async function sb(method, path, body) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
      method,
      headers: { Authorization: `Bearer ${sbToken}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }

  // 1. Database
  for (const file of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
    await sb("POST", "/database/query", { query: readFileSync(`supabase/migrations/${file}`, "utf8") });
    console.log(`✓ Database: ${file}`);
  }

  // 2. Sign-in redirect URLs
  const dev = await workersDevHost();
  const cur = await sb("GET", "/config/auth");
  const list = String(cur.uri_allow_list ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const wanted = [
    ...(domain ? [`https://${domain}/**`, `https://www.${domain}/**`] : []),
    ...(dev ? [`https://${dev}/**`] : []),
  ];
  const missing = wanted.filter((u) => !list.includes(u));
  if (missing.length) {
    await sb("PATCH", "/config/auth", { uri_allow_list: [...list, ...missing].join(",") });
    console.log(`✓ Added sign-in redirect URLs: ${missing.join(", ")}`);
  } else console.log("✓ Sign-in redirect URLs already there");
  process.exit(0);
}

// ---- post: the Worker exists now ----

// 3. Worker secrets
{
  const r = await cf("GET", `/accounts/${account}/workers/scripts/${worker}/secrets`);
  if (!r.ok) fail("Listing Worker secrets", r);
  const have = new Set((r.data.result ?? []).map((s) => s.name));
  for (const name of ["GEMINI_API_KEY", "TRIANGLE_LLM_URL", "TRIANGLE_LLM_API_KEY"]) {
    const value = opt(name);
    if (have.has(name)) console.log(`✓ ${name} already set on the Worker`);
    else if (value) {
      const p = await cf("PUT", `/accounts/${account}/workers/scripts/${worker}/secrets`, {
        name,
        text: value,
        type: "secret_text",
      });
      if (!p.ok) fail(`Saving ${name}`, p);
      console.log(`✓ Saved ${name} on the Worker`);
    }
  }
  if (!have.has("GEMINI_API_KEY") && !opt("GEMINI_API_KEY") && !have.has("TRIANGLE_LLM_URL") && !opt("TRIANGLE_LLM_URL"))
    console.log("! No AI backend is set (GEMINI_API_KEY or TRIANGLE_LLM_URL), so making beats will fail until one is.");
}

const dev = await workersDevHost();
if (!domain) {
  console.log(`Done. The site is at https://${dev || `${worker}.<subdomain>.workers.dev`} (no DOMAIN set, so no custom domain).`);
  process.exit(0);
}

// 4. Domain
let r = await cf("GET", `/zones?name=${domain}&account.id=${account}`);
if (!r.ok) fail("Looking up the zone", r);
let zone = r.data.result?.[0];
if (!zone) {
  r = await cf("POST", "/zones", { name: domain, account: { id: account }, type: "full" });
  if (!r.ok) fail("Adding the domain to Cloudflare", r);
  zone = r.data.result;
  console.log(`✓ Added ${domain} to Cloudflare (Free plan)`);
}
console.log(`Zone status: ${zone.status}`);
if (zone.status !== "active") {
  console.log(`ACTION: at the registrar for ${domain} → Nameservers → Custom DNS, set:`);
  for (const ns of zone.name_servers ?? []) console.log(`   ${ns}`);
  console.log("Custom domains attach on the first deploy after the zone turns active.");
  process.exit(0);
}

for (const host of [domain, `www.${domain}`]) {
  r = await cf("GET", `/zones/${zone.id}/dns_records?name=${host}`);
  if (!r.ok) fail(`Reading DNS for ${host}`, r);
  const records = r.data.result ?? [];
  for (const rec of records.filter((x) => (x.type === "A" || x.type === "AAAA") && oldIps.includes(x.content))) {
    const d = await cf("DELETE", `/zones/${zone.id}/dns_records/${rec.id}`);
    if (!d.ok) fail(`Removing old Lovable record on ${host}`, d);
    console.log(`✓ Removed old Lovable record ${host} → ${rec.content}`);
  }
  const left = records.filter(
    (x) => ["A", "AAAA", "CNAME"].includes(x.type) && !oldIps.includes(x.content) && !x.meta?.read_only,
  );
  if (left.length) {
    console.log(`! ${host} still points somewhere else (${left.map((x) => `${x.type} ${x.content}`).join(", ")}). Left as is.`);
    continue;
  }
  r = await cf("PUT", `/accounts/${account}/workers/domains`, {
    environment: "production",
    hostname: host,
    service: worker,
    zone_id: zone.id,
  });
  if (!r.ok) fail(`Attaching ${host} to the Worker`, r);
  console.log(`✓ ${host} → Worker ${worker}`);
}
console.log(`Done. The site is at https://${domain}${dev ? ` and https://${dev}` : ""}.`);
