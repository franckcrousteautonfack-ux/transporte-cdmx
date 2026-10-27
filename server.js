// Servidor sin dependencias: sirve la página y guarda en memoria
// las posiciones aproximadas que la gente comparte (expiran en 60 s).
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const SYS = ["metro", "mb", "tl", "sub", "cb", "edo"];
const BOX = { n: 19.8, s: 19.0, w: -99.5, e: -98.7 }; // CDMX y Edomex (aprox.)
const TTL = 60000;
const MAX_ENTRIES = 5000;
const MAX_REQ_PER_MIN = 120;

const TYPES = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png" };
const LEAFLET_DIR = path.join(__dirname, "public", "leaflet");
const live = new Map();
const hits = new Map();
const page = fs.readFileSync(path.join(__dirname, "public", "index.html"));

const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "geolocation=(self)",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data: https://tile.openstreetmap.org"
};

function reply(res, code, body, type) {
  res.writeHead(code, Object.assign({ "Content-Type": type || "application/json; charset=utf-8", "Cache-Control": "no-store" }, SECURITY));
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function clientIp(req) {
  const f = req.headers["x-forwarded-for"];
  return (f ? f.split(",")[0].trim() : req.socket.remoteAddress) || "x";
}

function limited(ip) {
  const now = Date.now();
  const h = (hits.get(ip) || []).filter((t) => now - t < 60000);
  h.push(now);
  hits.set(ip, h);
  return h.length > MAX_REQ_PER_MIN;
}

function readJson(req, cb) {
  let raw = "";
  req.on("data", (c) => {
    raw += c;
    if (raw.length > 2048) req.destroy();
  });
  req.on("end", () => {
    try { cb(JSON.parse(raw)); } catch (e) { cb(null); }
  });
}

const validId = (id) => typeof id === "string" && /^[a-f0-9]{8,40}$/.test(id);
const r3 = (n) => Math.round(n * 1000) / 1000; // ~110 m de precisión

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (limited(clientIp(req))) return reply(res, 429, { error: "demasiadas solicitudes" });

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    return reply(res, 200, page, "text/html; charset=utf-8");
  }

  if (req.method === "GET" && url.pathname.startsWith("/leaflet/")) {
    const file = path.join(__dirname, "public", path.normalize(decodeURIComponent(url.pathname)));
    if (file.indexOf(LEAFLET_DIR) !== 0) return reply(res, 404, { error: "no encontrado" });
    return fs.readFile(file, (e, d) => {
      if (e) return reply(res, 404, { error: "no encontrado" });
      reply(res, 200, d, TYPES[path.extname(file)] || "application/octet-stream");
    });
  }

  if (req.method === "GET" && url.pathname === "/api/live") {
    const me = url.searchParams.get("id");
    const now = Date.now();
    const out = [];
    live.forEach((v, id) => {
      if (now - v.t < TTL) out.push({ sys: v.sys, line: v.line, lat: v.lat, lng: v.lng, me: id === me });
    });
    return reply(res, 200, out);
  }

  if (req.method === "POST" && url.pathname === "/api/share") {
    return readJson(req, (b) => {
      if (!b || !validId(b.id) || SYS.indexOf(b.sys) < 0) return reply(res, 400, { error: "datos inválidos" });
      const lat = Number(b.lat), lng = Number(b.lng);
      if (!isFinite(lat) || !isFinite(lng) || lat < BOX.s || lat > BOX.n || lng < BOX.w || lng > BOX.e) {
        return reply(res, 400, { error: "fuera de CDMX y Estado de México" });
      }
      if (!live.has(b.id) && live.size >= MAX_ENTRIES) return reply(res, 503, { error: "servidor lleno" });
      const line = String(b.line || "").slice(0, 20).replace(/[^\p{L}\p{N} .\-]/gu, "");
      live.set(b.id, { sys: b.sys, line, lat: r3(lat), lng: r3(lng), t: Date.now() });
      reply(res, 200, { ok: true });
    });
  }

  if (req.method === "POST" && url.pathname === "/api/stop") {
    return readJson(req, (b) => {
      if (b && validId(b.id)) live.delete(b.id);
      reply(res, 200, { ok: true });
    });
  }

  reply(res, 404, { error: "no encontrado" });
}).listen(PORT, () => console.log("Servidor en puerto " + PORT));

setInterval(() => {
  const now = Date.now();
  live.forEach((v, id) => { if (now - v.t >= TTL) live.delete(id); });
  hits.forEach((h, ip) => { if (!h.some((t) => now - t < 60000)) hits.delete(ip); });
}, 10000);
