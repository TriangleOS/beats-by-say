// Sets up and refreshes everything Beats by Say needs. The deploy workflow runs it before each deploy.
// Every step checks first and only adds what's missing, so it's safe on every push to main.
//   1. Database: runs supabase/migrations/*.sql on the shared project (each file must be safe to re-run)
//   2. Supabase sign-in redirect URLs for the domain
//   3. Cloudflare Pages project with nodejs_compat
//   4. Server secrets on the Pages project (GEMINI_API_KEY, only when not set yet)
//   5. Cloudflare zone, Pages custom domains and DNS, only when DOMAIN is set
// Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, PROJECT,
//      optional DOMAIN, GEMINI_API_KEY, OLD_IPS.

import { readdirSync, readFileSync } from "node:fs";

const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing ${k}`);
  return v;
};
const opt = (k) => process.env[k] || "";
const CF = "https://api.cloudflare.com/client/v4";
const cfToken = env("CLOUDFLARE_API_TOKEN");
const account = env("CLOUDFLARE_ACCOUNT_ID");
const project = env("PROJECT");
const domain = opt("DOMAIN").toLowerCase().replace(/^www\./, "");
const ref = env("SUPABASE_PROJECT_REF");
const sbToken = env("SUPABASE_ACCESS_TOKEN");
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
{
  const cur = await sb("GET", "/config/auth");
  const list = String(cur.uri_allow_list ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const wanted = [...(domain ? [`https://${domain}/**`, `https://www.${domain}/**`] : []), `https://${project}.pages.dev/**`];
  const missing = wanted.filter((u) => !list.includes(u));
  if (missing.length) {
    await sb("PATCH", "/config/auth", { uri_allow_list: [...list, ...missing].join(",") });
    console.log(`✓ Added sign-in redirect URLs: ${missing.join(", ")}`);
  } else console.log("✓ Sign-in redirect URLs already there");
}

// 3. Pages project
const compat = { compatibility_date: "2026-10-01", compatibility_flags: ["nodejs_compat"] };
let r = await cf("GET", `/accounts/${account}/pages/projects/${project}`);
if (r.status === 404 || (!r.ok && r.data.errors?.some((e) => e.code === 8000007))) {
  r = await cf("POST", `/accounts/${account}/pages/projects`, {
    name: project,
    production_branch: "main",
    deployment_configs: { production: compat, preview: compat },
  });
  if (!r.ok) fail("Creating the Pages project", r);
  console.log(`✓ Created Pages project ${project}`);
} else if (!r.ok) fail("Reading the Pages project", r);
else console.log(`✓ Pages project ${project} exists`);

const existing = r.data.result?.deployment_configs?.production?.env_vars ?? {};

// 4. Server secrets
const gemini = opt("GEMINI_API_KEY");
if (gemini && !existing.GEMINI_API_KEY) {
  r = await cf("PATCH", `/accounts/${account}/pages/projects/${project}`, {
    deployment_configs: { production: { ...compat, env_vars: { GEMINI_API_KEY: { type: "secret_text", value: gemini } } } },
  });
  if (!r.ok) fail("Saving GEMINI_API_KEY", r);
  console.log("✓ Saved GEMINI_API_KEY on the Pages project");
} else if (existing.GEMINI_API_KEY) console.log("✓ GEMINI_API_KEY already set");
else console.log("! GEMINI_API_KEY isn't set, so making beats will fail until it is.");

if (!domain) {
  console.log(`Done. The site is at https://${project}.pages.dev (no DOMAIN set, so no custom domain).`);
  process.exit(0);
}

// 5. Domain
r = await cf("GET", `/zones?name=${domain}&account.id=${account}`);
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
  console.log(`ACTION FOR FABIAN at the registrar for ${domain} → Nameservers → Custom DNS:`);
  for (const ns of zone.name_servers ?? []) console.log(`   ${ns}`);
}
const target = `${project}.pages.dev`;
for (const host of [domain, `www.${domain}`]) {
  r = await cf("POST", `/accounts/${account}/pages/projects/${project}/domains`, { name: host });
  if (r.ok) console.log(`✓ Added custom domain ${host}`);
  else if (JSON.stringify(r.data.errors ?? "").match(/already|exists/i)) console.log(`✓ Custom domain ${host} already added`);
  else fail(`Adding custom domain ${host}`, r);
  r = await cf("GET", `/zones/${zone.id}/dns_records?name=${host}`);
  if (!r.ok) fail(`Reading DNS for ${host}`, r);
  const records = r.data.result ?? [];
  for (const rec of records.filter((x) => x.type === "A" && oldIps.includes(x.content))) {
    const d = await cf("DELETE", `/zones/${zone.id}/dns_records/${rec.id}`);
    if (!d.ok) fail(`Removing old A record on ${host}`, d);
    console.log(`✓ Removed old Lovable record ${host} → ${rec.content}`);
  }
  const cname = records.find((x) => x.type === "CNAME");
  const blocking = records.filter((x) => (x.type === "A" || x.type === "AAAA") && !oldIps.includes(x.content));
  if (cname?.content === target) console.log(`✓ CNAME ${host} → ${target} exists`);
  else if (cname || blocking.length) {
    console.log(
      `! ${host} points somewhere else (${(cname ? [cname] : blocking).map((x) => `${x.type} ${x.content}`).join(", ")}). Left as is.`,
    );
  } else {
    r = await cf("POST", `/zones/${zone.id}/dns_records`, { type: "CNAME", name: host, content: target, proxied: true, ttl: 1 });
    if (!r.ok) fail(`Adding CNAME ${host}`, r);
    console.log(`✓ Added CNAME ${host} → ${target}`);
  }
}
console.log(`Done. The site is at https://${target} and, once the zone is active, https://${domain}.`);
