import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import {
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";

const scrypt = promisify(scryptCallback);
const root = process.cwd();
const dataDir = join(root, "data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, "coco-auth.sqlite"));
db.exec(`PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  member_id INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);`);
try {
  db.exec("ALTER TABLE users ADD COLUMN member_id INTEGER");
} catch (error) {
  if (!String(error.message).includes("duplicate column name")) throw error;
}
function generateMemberId() {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const value = randomInt(10000, 100000);
    if (!db.prepare("SELECT 1 FROM users WHERE member_id=?").get(value))
      return value;
  }
  throw new Error("Could not allocate a unique 5-digit member ID.");
}
for (const user of db
  .prepare("SELECT id FROM users WHERE member_id IS NULL")
  .all())
  db.prepare("UPDATE users SET member_id=? WHERE id=?").run(
    generateMemberId(),
    user.id,
  );
db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS users_member_id_unique ON users(member_id)",
);

const production = process.env.NODE_ENV === "production";
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const sessionDuration = 7 * 24 * 60 * 60 * 1000;
const publicFiles = new Set([
  "index.html",
  "auth.html",
  "auth.js",
  "auth.css",
  "app.js",
  "styles.css",
  "chocolate.css",
  "dashboard.css",
  "dashboard-extra.css",
]);
const attempts = new Map();
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function send(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}
function cookieValue(req, name) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        const i = x.indexOf("=");
        return [x.slice(0, i), decodeURIComponent(x.slice(i + 1))];
      }),
  );
  return cookies[name] || "";
}
function setSessionCookie(res, token, maxAge) {
  res.setHeader(
    "Set-Cookie",
    `coco_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${production ? "; Secure" : ""}`,
  );
}
function newInviteCode() {
  let code;
  do {
    code = `COCO-${randomBytes(5).toString("hex").toUpperCase()}`;
  } while (db.prepare("SELECT 1 FROM users WHERE invite_code = ?").get(code));
  return code;
}
function userForSession(req) {
  const token = cookieValue(req, "coco_session");
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = db
    .prepare(
      `SELECT users.id, users.member_id, users.email, users.invite_code, users.created_at
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
    )
    .get(tokenHash, Date.now());
  if (!row) return null;
  return {
    id: row.id,
    member_id: row.member_id,
    email: row.email,
    identifier: row.email,
    invite_code: row.invite_code,
    created_at: row.created_at,
  };
}
function normalizeIdentifier(value) {
  const input = String(value || "").trim();
  if (input.includes("@")) {
    const email = input.toLowerCase();
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? { value: email }
      : { error: "Enter a valid email address or phone number." };
  }
  const phone = input.replace(/[\s().-]/g, "");
  return /^\+?\d{7,15}$/.test(phone)
    ? { value: phone }
    : { error: "Enter a valid email address or phone number." };
}
function normalizeLoopbackHost(value) {
  const hostname = String(value || "").replace(/^\[|\]$/g, "");
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    ? "localhost"
    : hostname;
}
function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const requestHost = new URL(`http://${req.headers.host || "localhost"}`);
    const sameHost =
      normalizeLoopbackHost(originUrl.hostname) ===
      normalizeLoopbackHost(requestHost.hostname);
    const originPort =
      originUrl.port || (originUrl.protocol === "https:" ? "443" : "80");
    const requestPort =
      requestHost.port || (requestHost.protocol === "https:" ? "443" : "80");
    return sameHost && originPort === requestPort;
  } catch {
    return false;
  }
}
async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 8192)
      throw Object.assign(new Error("Request too large"), { status: 413 });
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  }
}
function rateLimited(req) {
  const ip = req.socket.remoteAddress || "local";
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  let entry = attempts.get(ip);
  if (!entry || now - entry.start > windowMs) entry = { start: now, count: 0 };
  entry.count++;
  attempts.set(ip, entry);
  if (attempts.size > 2000)
    for (const [key, value] of attempts)
      if (now - value.start > windowMs) attempts.delete(key);
  return entry.count > 12;
}
async function createSession(userId, res) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = Date.now() + sessionDuration;
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  db.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
  ).run(tokenHash, userId, expiresAt);
  setSessionCookie(res, token, Math.floor(sessionDuration / 1000));
}
async function authRoute(req, res, pathname) {
  if (pathname === "/api/session" && req.method === "GET")
    return send(res, 200, { user: userForSession(req) });
  if (pathname === "/api/logout" && req.method === "POST") {
    const token = cookieValue(req, "coco_session");
    if (token)
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(
        createHash("sha256").update(token).digest("hex"),
      );
    setSessionCookie(res, "", 0);
    return send(res, 200, { ok: true });
  }
  if (
    !["/api/register", "/api/login"].includes(pathname) ||
    req.method !== "POST"
  )
    return false;
  if (!checkOrigin(req))
    return send(res, 403, { error: "Request origin not allowed" });
  if (rateLimited(req))
    return send(res, 429, {
      error: "Too many attempts. Please wait 15 minutes.",
    });
  let body;
  try {
    body = await readJson(req);
  } catch (error) {
    return send(res, error.status || 400, { error: error.message });
  }
  const identity = normalizeIdentifier(body.identifier ?? body.email);
  const password = String(body.password || "");
  if (identity.error) return send(res, 400, { error: identity.error });
  if (password.length < 8 || password.length > 200)
    return send(res, 400, { error: "Password must be 8–200 characters." });
  const identifier = identity.value;

  if (pathname === "/api/register") {
    const salt = randomBytes(16);
    const hash = await scrypt(password, salt, 64, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 32 * 1024 * 1024,
    });
    const id = randomBytes(16).toString("hex");
    const memberId = generateMemberId();
    const inviteCode = newInviteCode();
    try {
      db.prepare(
        "INSERT INTO users(id,email,password_salt,password_hash,invite_code,created_at,member_id) VALUES(?,?,?,?,?,?,?)",
      ).run(
        id,
        identifier,
        salt.toString("hex"),
        Buffer.from(hash).toString("hex"),
        inviteCode,
        new Date().toISOString(),
        memberId,
      );
    } catch (error) {
      if (String(error.message).includes("UNIQUE"))
        return send(res, 409, {
          error:
            "An account with this email or phone number already exists. Sign in instead.",
        });
      throw error;
    }
    await createSession(id, res);
    return send(res, 201, {
      user: {
        id,
        member_id: memberId,
        email: identifier,
        identifier,
        invite_code: inviteCode,
        created_at: new Date().toISOString(),
      },
    });
  }

  const row = db
    .prepare(
      "SELECT id,member_id,email,password_salt,password_hash FROM users WHERE email = ? COLLATE NOCASE",
    )
    .get(identifier);
  const salt = row ? Buffer.from(row.password_salt, "hex") : Buffer.alloc(16);
  const expected = row
    ? Buffer.from(row.password_hash, "hex")
    : Buffer.alloc(64);
  const actual = Buffer.from(
    await scrypt(password, salt, 64, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 32 * 1024 * 1024,
    }),
  );
  if (!row || !timingSafeEqual(actual, expected))
    return send(res, 401, {
      error: "Email/phone number or password is incorrect.",
    });
  await createSession(row.id, res);
  return send(res, 200, {
    user: {
      id: row.id,
      member_id: row.member_id,
      email: row.email,
      identifier: row.email,
      invite_code: db
        .prepare("SELECT invite_code FROM users WHERE id=?")
        .get(row.id).invite_code,
    },
  });
}

const server = createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) {
      const handled = await authRoute(req, res, url.pathname);
      if (handled !== false) return;
      return send(res, 404, { error: "Not found" });
    }
    if (!["GET", "HEAD"].includes(req.method))
      return send(res, 405, { error: "Method not allowed" });
    const requested =
      url.pathname === "/"
        ? "index.html"
        : decodeURIComponent(url.pathname.slice(1));
    if (requested.includes("/") || !publicFiles.has(requested))
      return send(res, 404, { error: "Not found" });
    const file = resolve(root, normalize(requested));
    if (file !== root && !file.startsWith(root + sep))
      return send(res, 404, { error: "Not found" });
    if (!existsSync(file) || !statSync(file).isFile())
      return send(res, 404, { error: "Not found" });
    const contentType =
      mime[extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
    });
    if (req.method === "HEAD") return res.end();
    createReadStream(file).pipe(res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) send(res, 500, { error: "Server error" });
    else res.destroy();
  }
});
server.listen(port, host, () =>
  console.log(`Coco & Co. auth demo: http://${host}:${port}`),
);
