/**
 * Download the demo tile and story photos with Playwright.
 *
 * Wikimedia Commons search, then the browser context saves a JPEG for each
 * public id the resident screens ask for. Yes and no are drawn in the
 * browser so the answer tiles stay a clear check and cross.
 *
 * Run from web/: node scripts/download-demo-photos.mjs
 */

import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.join(root, "web/public/demo");
const agent = "InMyWordsDemo/1.0 (CommuniHacks demo; educational; contact: project README)";

const JOBS = [
  { ids: ["tiles/marcus_coffee"], query: "cup of coffee", need: /coffee|espresso/i },
  { ids: ["tiles/marcus_tea", "tiles/dana_tea"], query: "cup of tea", need: /tea/i },
  {
    ids: ["tiles/marcus_bowling", "story/marcus_bowling"],
    query: "bowling ball",
    need: /bowl/i,
    file: "File:Bowling with red ball.jpg",
  },
  { ids: ["tiles/marcus_raptors"], query: "basketball", need: /basketball/i },
  { ids: ["tiles/marcus_park"], query: "public park path", need: /park/i },
  { ids: ["tiles/marcus_music"], query: "headphones", need: /headphone/i },
  { ids: ["tiles/marcus_bus", "tiles/dana_bus"], query: "transit bus", need: /bus/i },
  { ids: ["tiles/marcus_quiet"], query: "armchair", need: /armchair|sofa|living room/i },
  { ids: ["tiles/marcus_lisa", "story/marcus_lisa"], query: "smiling woman portrait", need: /woman/i },
  { ids: ["tiles/marcus_help", "tiles/dana_help"], query: "open hand", need: /hand/i },
  { ids: ["tiles/dana_garden", "story/dana_garden"], query: "vegetable garden", need: /garden/i },
  { ids: ["tiles/dana_sister"], query: "portrait of a woman smiling", need: /woman/i },
  { ids: ["tiles/dana_groceries"], query: "grocery vegetables", need: /grocery|vegetable|market/i },
  { ids: ["tiles/dana_walk", "story/dana_walk"], query: "walking path park", need: /walk|path|park/i },
  { ids: ["tiles/dana_money"], query: "coins currency", need: /coin|money|currency/i },
  { ids: ["tiles/dana_tv"], query: "television set", need: /television|\btv\b/i },
  { ids: ["tiles/dana_herbs"], query: "basil plant pot", need: /basil|herb|plant/i },
  { ids: ["tiles/marcus_movie"], query: "cinema seats", need: /cinema|movie|theater|theatre/i },
  { ids: ["tiles/marcus_later", "tiles/dana_later"], query: "wall clock", need: /clock/i },
  { ids: ["story/marcus_portrait"], query: "smiling man portrait", need: /\bman\b/i },
];

const SKIP = /logo|icon|flag|map|diagram|svg|coat of arms|balcony|cartoon|drawing|illustration|emoji|pictogram|symbol|stamp|poster|screenshot|child|baby|girl|boy|kid|nude|bikini|underwear/i;

function dest(publicId) {
  return path.join(outDir, `${publicId}.jpg`);
}

async function filePage(request, title) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("titles", title);
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|size|extmetadata");
  url.searchParams.set("iiurlwidth", "960");
  await sleep(700);
  const response = await getWithRetry(request, url.toString());
  if (!response.ok()) throw new Error(`file ${response.status()} ${title}`);
  const data = await response.json();
  return Object.values(data.query?.pages ?? {});
}

async function search(request, query) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `${query} filetype:bitmap`);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "20");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|size|extmetadata");
  url.searchParams.set("iiurlwidth", "960");
  await sleep(700);
  const response = await getWithRetry(request, url.toString());
  if (!response.ok()) throw new Error(`search ${response.status()} for ${query}`);
  const data = await response.json();
  return Object.values(data.query?.pages ?? {});
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getWithRetry(request, url) {
  let last = "request failed";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request.get(url, {
      headers: { "User-Agent": agent, "Api-User-Agent": agent },
      timeout: 40_000,
    });
    if (response.status() === 429) {
      await sleep(1500 * (attempt + 1));
      last = "429";
      continue;
    }
    return response;
  }
  throw new Error(last);
}

function usable(page, need) {
  const title = page.title ?? "";
  if (SKIP.test(title) || !need.test(title)) return null;
  const info = page.imageinfo?.[0];
  if (!info) return null;
  const mime = info.mime ?? "";
  if (!mime.startsWith("image/jpeg") && !mime.startsWith("image/png")) return null;
  const thumb = info.thumburl || info.url;
  if (!thumb) return null;
  const license = info.extmetadata?.LicenseShortName?.value ?? "";
  if (!/cc0|cc by|public domain/i.test(license)) return null;
  const artist = (info.extmetadata?.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim();
  return { title, thumb, license, artist };
}

async function save(request, fileUrl, publicIds) {
  await sleep(700);
  const response = await getWithRetry(request, fileUrl);
  if (!response.ok()) throw new Error(`download ${response.status()} ${fileUrl}`);
  const bytes = await response.body();
  if (bytes.length < 20_000) throw new Error(`too small (${bytes.length}) ${fileUrl}`);
  const first = dest(publicIds[0]);
  mkdirSync(path.dirname(first), { recursive: true });
  writeFileSync(first, bytes);
  const squeezed = spawnSync(
    "python3",
    [
      "-c",
      "import sys; from PIL import Image; p=sys.argv[1]; im=Image.open(p).convert('RGB'); im.thumbnail((960,960)); im.save(p,'JPEG',quality=82,optimize=True)",
      first,
    ],
    { encoding: "utf8" },
  );
  if (squeezed.status !== 0) throw new Error(squeezed.stderr || "could not save jpeg");
  const jpeg = readFileSync(first);
  if (jpeg.length < 18_000) throw new Error(`saved file too small (${jpeg.length})`);
  for (const id of publicIds.slice(1)) {
    const copy = dest(id);
    mkdirSync(path.dirname(copy), { recursive: true });
    writeFileSync(copy, jpeg);
  }
  return jpeg.length;
}

async function drawAnswer(page, kind, publicIds) {
  const mark = kind === "yes" ? "✓" : "✕";
  const color = kind === "yes" ? "#1f7a4d" : "#9d2c2c";
  const ground = kind === "yes" ? "#e5f6ec" : "#fdeCEC";
  await page.setContent(`<!doctype html><body style="margin:0;background:${ground}">
    <div style="width:960px;height:960px;display:flex;align-items:center;justify-content:center;
      font: 640px/1 sans-serif; color:${color}">${mark}</div></body>`);
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 960, height: 960 }, type: "png" });
  const temp = path.join(outDir, `_mark-${kind}.png`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(temp, png);
  const first = dest(publicIds[0]);
  const drawn = spawnSync(
    "python3",
    [
      "-c",
      "import sys; from PIL import Image; im=Image.open(sys.argv[1]).convert('RGB'); im.save(sys.argv[2],'JPEG',quality=86,optimize=True)",
      temp,
      first,
    ],
    { encoding: "utf8" },
  );
  if (drawn.status !== 0) throw new Error(drawn.stderr || "could not draw answer tile");
  const jpeg = readFileSync(first);
  for (const id of publicIds.slice(1)) writeFileSync(dest(id), jpeg);
}

const browser = await chromium.launch();
const context = await browser.newContext({ userAgent: agent });
const request = context.request;
const page = await context.newPage();
const credits = [];
const usedTitles = new Set();

const only = new Set((process.env.ONLY ?? "").split(",").filter(Boolean));

for (const job of JOBS) {
  if (only.size && !job.ids.some((id) => only.has(id))) continue;
  const pages = job.file ? await filePage(request, job.file) : await search(request, job.query);
  let saved = null;
  let lastError = "no usable file";
  for (const candidate of pages) {
    const file = usable(candidate, job.need);
    if (file && usedTitles.has(file.title)) continue;
    if (!file) continue;
    try {
      const bytes = await save(request, file.thumb, job.ids);
      saved = { ...file, bytes };
      usedTitles.add(file.title);
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  if (!saved) throw new Error(`${job.query}: ${lastError}`);
  credits.push({
    ids: job.ids,
    title: saved.title,
    license: saved.license,
    artist: saved.artist,
    bytes: saved.bytes,
  });
  console.log(`${job.ids[0]}  ${saved.bytes} bytes  ${saved.license}  ${saved.title}`);
}

async function drawSvg(page, svg, publicIds) {
  await page.setContent(`<!doctype html><body style="margin:0;background:#f4f7f6">${svg}</body>`);
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 960, height: 960 }, type: "png" });
  const temp = path.join(outDir, "_symbol.png");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(temp, png);
  const first = dest(publicIds[0]);
  const drawn = spawnSync(
    "python3",
    [
      "-c",
      "import sys; from PIL import Image; im=Image.open(sys.argv[1]).convert('RGB'); im.save(sys.argv[2],'JPEG',quality=86,optimize=True)",
      temp,
      first,
    ],
    { encoding: "utf8" },
  );
  if (drawn.status !== 0) throw new Error(drawn.stderr || "could not draw symbol");
  const jpeg = readFileSync(first);
  for (const id of publicIds.slice(1)) {
    mkdirSync(path.dirname(dest(id)), { recursive: true });
    writeFileSync(dest(id), jpeg);
  }
}

const person = (hair, shirt) => `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="960" viewBox="0 0 960 960">
  <rect width="960" height="960" fill="#f4f7f6"/>
  <circle cx="480" cy="330" r="150" fill="#f0c7a8"/>
  <path d="M330 250c20-140 280-140 300 10c-40-80-260-80-300-10z" fill="${hair}"/>
  <path d="M250 860c40-220 420-220 460 0" fill="${shirt}"/>
  <circle cx="420" cy="320" r="16" fill="#243038"/><circle cx="540" cy="320" r="16" fill="#243038"/>
  <path d="M430 400c30 36 70 36 100 0" fill="none" stroke="#243038" stroke-width="12" stroke-linecap="round"/>
</svg>`;

const hand = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="960" viewBox="0 0 960 960">
  <rect width="960" height="960" fill="#f4f7f6"/>
  <g fill="#e7b08a" stroke="#243038" stroke-width="14">
    <rect x="390" y="430" width="180" height="360" rx="70"/>
    <rect x="250" y="250" width="110" height="280" rx="55"/>
    <rect x="370" y="160" width="110" height="320" rx="55"/>
    <rect x="490" y="140" width="110" height="340" rx="55"/>
    <rect x="610" y="200" width="110" height="300" rx="55"/>
  </g>
</svg>`;

if (!only.size || only.has("tiles/marcus_yes")) {
  await drawAnswer(page, "yes", ["tiles/marcus_yes", "tiles/dana_yes"]);
  await drawAnswer(page, "no", ["tiles/marcus_no", "tiles/dana_no"]);
}
if (!only.size || only.has("tiles/marcus_lisa")) {
  await drawSvg(page, person("#3d342c", "#3d6b8c"), ["tiles/marcus_lisa", "story/marcus_lisa"]);
  await drawSvg(page, person("#6b3f2a", "#c46b4a"), ["tiles/dana_sister"]);
  await drawSvg(page, person("#2c3338", "#2f6b4f"), ["story/marcus_portrait"]);
  await drawSvg(page, hand, ["tiles/marcus_help", "tiles/dana_help"]);
  console.log("people and help tiles drawn as simple symbols");
}
if (!only.size || only.has("tiles/marcus_yes")) {
  credits.push({
    ids: ["tiles/marcus_yes", "tiles/dana_yes", "tiles/marcus_no", "tiles/dana_no"],
    title: "Drawn in the browser for the answer tiles",
    license: "project original",
    artist: "In My Words",
    bytes: 0,
  });
  console.log("tiles/marcus_yes  drawn check");
  console.log("tiles/marcus_no  drawn cross");
}
credits.push({
  ids: ["tiles/marcus_lisa", "story/marcus_lisa", "tiles/dana_sister", "story/marcus_portrait", "tiles/marcus_help", "tiles/dana_help"],
  title: "Simple drawn symbols, so a real person's photo is not used as a resident",
  license: "project original",
  artist: "In My Words",
  bytes: 0,
});

const creditsPath = path.join(outDir, "credits.json");
let previous = [];
try {
  previous = JSON.parse(readFileSync(creditsPath, "utf8"));
} catch {
  previous = [];
}
const byId = new Map();
for (const row of [...previous, ...credits]) {
  for (const id of row.ids) byId.set(id, row);
}
const merged = [...new Map([...byId.values()].map((row) => [row.ids.join("|"), row])).values()];
writeFileSync(creditsPath, JSON.stringify(merged, null, 2) + "\n");
await browser.close();
