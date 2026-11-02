// Copies the images from the Lovable project into src/assets and public/, replacing the 1-pixel
// placeholders. Runs in GitHub Actions (this sandbox can't reach Lovable). Tries the raw files on the
// Lovable preview first, then the hashed copies in the published build.
// Env: HOSTS = comma-separated sites that served the published Lovable build; PREVIEW = the preview URL.
import { readFileSync, writeFileSync, statSync } from "node:fs";

const FILES = ["src/assets/hero-studio.jpg", "src/assets/logo-icon.png", "src/assets/logo-wordmark.png", "public/favicon.png"];
const preview = (process.env.PREVIEW || "").replace(/\/$/, "");
const hosts = (process.env.HOSTS || "").split(",").map((h) => h.trim().replace(/\/$/, "")).filter(Boolean);

const isImage = (res) => res.ok && (res.headers.get("content-type") || "").startsWith("image/");

// Hashed asset URLs from each published build (e.g. /assets/hero-studio-AbC123.jpg).
const built = [];
for (const host of hosts) {
  try {
    const html = await (await fetch(host)).text();
    const scripts = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
    let text = html;
    for (const s of scripts) text += await (await fetch(host + s)).text().catch(() => "");
    for (const m of text.matchAll(/\/assets\/[A-Za-z0-9_.-]+\.(?:png|jpe?g|webp|svg)/g)) built.push(host + m[0]);
  } catch { /* try the next host */ }
}

let missing = 0;
for (const file of FILES) {
  if (statSync(file).size > 1000) { console.log(`✓ ${file} already real`); continue; }
  const name = file.split("/").pop();
  const [stem, ext] = [name.replace(/\.[^.]+$/, ""), name.split(".").pop()];
  const candidates = [
    ...(preview ? [`${preview}/${file}`] : []),
    ...(file.startsWith("public/") ? hosts.map((h) => `${h}/${name}`) : []),
    ...built.filter((u) => u.split("/").pop().startsWith(`${stem}-`) && u.endsWith(`.${ext}`)),
  ];
  let saved = false;
  for (const url of candidates) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!isImage(res)) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(file, buf);
      console.log(`✓ ${file} (${buf.length} bytes) from ${url}`);
      saved = true;
      break;
    } catch { /* next */ }
  }
  if (!saved) { missing++; console.log(`! Couldn't download ${file}`); }
}
if (missing) { console.log(`${missing} image(s) not copied.`); process.exitCode = 1; }
