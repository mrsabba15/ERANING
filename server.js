import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import {
  randomBytes,
  randomInt,
  createHmac,
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
CREATE TABLE IF NOT EXISTS recharge_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
  currency TEXT NOT NULL,
  razorpay_order_id TEXT NOT NULL UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('created', 'paid')),
  created_at TEXT NOT NULL,
  paid_at TEXT
);
CREATE TABLE IF NOT EXISTS product_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL,
  amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
  currency TEXT NOT NULL,
  razorpay_order_id TEXT NOT NULL UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('created', 'paid')),
  created_at TEXT NOT NULL,
  paid_at TEXT
);
CREATE TABLE IF NOT EXISTS wallet_credits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recharge_order_id TEXT NOT NULL UNIQUE REFERENCES recharge_orders(id),
  razorpay_payment_id TEXT NOT NULL UNIQUE,
  amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wallet_purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL,
  amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS active_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL,
  amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
  daily_reward_paise INTEGER NOT NULL DEFAULT 0 CHECK(daily_reward_paise >= 0),
  duration_days INTEGER NOT NULL CHECK(duration_days > 0),
  purchased_at TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('wallet', 'razorpay'))
);
CREATE TABLE IF NOT EXISTS plan_reward_days (
  id TEXT PRIMARY KEY,
  active_plan_id TEXT NOT NULL REFERENCES active_plans(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_day INTEGER NOT NULL CHECK(reward_day > 0),
  amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
  created_at TEXT NOT NULL,
  UNIQUE(active_plan_id, reward_day)
);
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
  status TEXT NOT NULL CHECK(status IN ('pending', 'paid', 'rejected')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  payout_reference TEXT,
  payout_method TEXT,
  upi_id TEXT,
  account_holder_name TEXT,
  account_number TEXT,
  ifsc_code TEXT
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);`);
const withdrawalColumns = new Set(
  db.prepare("PRAGMA table_info(withdrawal_requests)").all().map((column) => column.name),
);
if (!withdrawalColumns.has("admin_decision")) {
  db.exec(`ALTER TABLE withdrawal_requests ADD COLUMN admin_decision TEXT NOT NULL
    DEFAULT 'pending' CHECK(admin_decision IN ('pending', 'accepted', 'rejected'))`);
  withdrawalColumns.add("admin_decision");
}
for (const column of ["payout_method", "upi_id", "account_holder_name", "account_number", "ifsc_code"]) {
  if (withdrawalColumns.has(column)) continue;
  db.exec(`ALTER TABLE withdrawal_requests ADD COLUMN ${column} TEXT`);
  withdrawalColumns.add(column);
}
// Restore requests that the previous payout-link flow incorrectly auto-rejected.
if (withdrawalColumns.has("payout_provider_status"))
  db.prepare(`UPDATE withdrawal_requests SET status='pending', admin_decision='pending',
    reviewed_at=NULL, payout_provider_status=NULL
    WHERE status='rejected' AND payout_provider_status='not_sent_legacy'`).run();
const purchasableProducts = new Map([
  [1, { name: "Product A", amountPaise: 55000, dailyRewardPaise: 11000, durationDays: 45 }],
  [2, { name: "Product B", amountPaise: 123000, dailyRewardPaise: 20500, durationDays: 45 }],
  [3, { name: "Product C", amountPaise: 350000, dailyRewardPaise: 49000, durationDays: 20 }],
  [4, { name: "Product D", amountPaise: 850000, dailyRewardPaise: 120000, durationDays: 22 }],
  [5, { name: "Product E", amountPaise: 1500000, dailyRewardPaise: 187500, durationDays: 22 }],
  [6, { name: "Product F", amountPaise: 4000000, dailyRewardPaise: 220000, durationDays: 20 }],
  [7, { name: "VIP 1", amountPaise: 100000, dailyRewardPaise: 0, durationDays: 1 }],
  [8, { name: "VIP 2", amountPaise: 500000, dailyRewardPaise: 0, durationDays: 1 }],
  [9, { name: "VIP 3", amountPaise: 800000, dailyRewardPaise: 0, durationDays: 2 }],
  [10, { name: "VIP 4", amountPaise: 2000000, dailyRewardPaise: 0, durationDays: 2 }],
]);
for (const purchase of db.prepare("SELECT * FROM wallet_purchases").all()) {
  const product = purchasableProducts.get(purchase.product_id);
  if (!product) continue;
  db.prepare(`INSERT OR IGNORE INTO active_plans
    (id,user_id,product_id,amount_paise,daily_reward_paise,duration_days,purchased_at,payment_method)
    VALUES(?,?,?,?,?,?,?,'wallet')`).run(
    purchase.id,
    purchase.user_id,
    purchase.product_id,
    product.amountPaise,
    product.dailyRewardPaise,
    product.durationDays,
    purchase.created_at,
  );
}
for (const order of db
  .prepare("SELECT * FROM product_orders WHERE status = 'paid'")
  .all()) {
  const product = purchasableProducts.get(order.product_id);
  if (!product) continue;
  db.prepare(`INSERT OR IGNORE INTO active_plans
    (id,user_id,product_id,amount_paise,daily_reward_paise,duration_days,purchased_at,payment_method)
    VALUES(?,?,?,?,?,?,?,'razorpay')`).run(
    order.id,
    order.user_id,
    order.product_id,
    order.amount_paise,
    product.dailyRewardPaise,
    product.durationDays,
    order.paid_at || order.created_at,
  );
}
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
    wallet_balance_rupees: walletBalanceFor(row.id),
    is_admin: isConfiguredAdmin(row.email),
  };
}
function isConfiguredAdmin(email) {
  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  return Boolean(adminEmail && String(email || "").trim().toLowerCase() === adminEmail);
}
function walletBalanceFor(userId) {
  return Math.floor(walletBalancePaiseFor(userId) / 100);
}
function walletBalancePaiseFor(userId) {
  const result = db
    .prepare(`SELECT
      COALESCE((SELECT SUM(amount_paise) FROM wallet_credits WHERE user_id = ?), 0) -
      COALESCE((SELECT SUM(amount_paise) FROM wallet_purchases WHERE user_id = ?), 0) AS balance`)
    .get(userId, userId);
  return Math.max(0, result.balance);
}
const rewardPeriodMs = 24 * 60 * 60 * 1000;
function accruePlanRewardsFor(userId) {
  const now = Date.now();
  const plans = db
    .prepare("SELECT * FROM active_plans WHERE user_id = ?")
    .all(userId);
  const insertReward = db.prepare(`INSERT OR IGNORE INTO plan_reward_days
    (id,active_plan_id,user_id,reward_day,amount_paise,created_at)
    VALUES(?,?,?,?,?,?)`);
  for (const plan of plans) {
    if (plan.daily_reward_paise <= 0) continue;
    const purchasedAt = Date.parse(plan.purchased_at);
    if (!Number.isFinite(purchasedAt)) continue;
    const dueDays = Math.min(
      plan.duration_days,
      Math.max(0, Math.floor((now - purchasedAt) / rewardPeriodMs)),
    );
    for (let day = 1; day <= dueDays; day++) {
      insertReward.run(
        randomBytes(16).toString("hex"),
        plan.id,
        userId,
        day,
        plan.daily_reward_paise,
        new Date(purchasedAt + day * rewardPeriodMs).toISOString(),
      );
    }
  }
}
function availableRewardsPaiseFor(userId) {
  const result = db.prepare(`SELECT
    COALESCE((SELECT SUM(amount_paise) FROM plan_reward_days WHERE user_id = ?), 0) -
    COALESCE((SELECT SUM(amount_paise) FROM withdrawal_requests
      WHERE user_id = ? AND status IN ('pending', 'paid')), 0) AS balance`).get(userId, userId);
  return Math.max(0, result.balance);
}
function plansOverviewFor(userId) {
  accruePlanRewardsFor(userId);
  const now = Date.now();
  const plans = db
    .prepare("SELECT * FROM active_plans WHERE user_id = ? ORDER BY purchased_at DESC")
    .all(userId)
    .map((plan) => {
      const product = purchasableProducts.get(plan.product_id);
      const purchasedAt = Date.parse(plan.purchased_at);
      const elapsedDays = Math.min(
        plan.duration_days,
        Math.max(0, Math.floor((now - purchasedAt) / rewardPeriodMs)),
      );
      const earned = db
        .prepare("SELECT COALESCE(SUM(amount_paise), 0) AS total FROM plan_reward_days WHERE active_plan_id = ?")
        .get(plan.id).total;
      return {
        id: plan.id,
        product_name: product?.name || `Plan ${plan.product_id}`,
        purchased_at: plan.purchased_at,
        price_rupees: Math.floor(plan.amount_paise / 100),
        daily_reward_rupees: Math.floor(plan.daily_reward_paise / 100),
        duration_days: plan.duration_days,
        days_completed: elapsedDays,
        days_remaining: Math.max(0, plan.duration_days - elapsedDays),
        rewards_earned_rupees: Math.floor(earned / 100),
        next_reward_at:
          plan.daily_reward_paise > 0 && elapsedDays < plan.duration_days
            ? new Date(purchasedAt + (elapsedDays + 1) * rewardPeriodMs).toISOString()
            : null,
        status: elapsedDays >= plan.duration_days ? "completed" : "active",
        payment_method: plan.payment_method,
      };
    });
  const withdrawals = db
    .prepare(`SELECT id,amount_paise,status,admin_decision,created_at,reviewed_at
      FROM withdrawal_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`)
    .all(userId)
    .map((request) => ({
      id: request.id,
      amount_rupees: Math.floor(request.amount_paise / 100),
      status: request.admin_decision === "accepted" ? "accepted" : request.status,
      created_at: request.created_at,
      reviewed_at: request.reviewed_at,
    }));
  const rewardsEarnedPaise = db
    .prepare("SELECT COALESCE(SUM(amount_paise), 0) AS total FROM plan_reward_days WHERE user_id = ?")
    .get(userId).total;
  return {
    plans,
    rewards_earned_rupees: Math.floor(rewardsEarnedPaise / 100),
    rewards_available_rupees: Math.floor(availableRewardsPaiseFor(userId) / 100),
    withdrawals,
  };
}
function razorpayCredentials() {
  return {
    keyId: String(process.env.RAZORPAY_KEY_ID || "").trim(),
    keySecret: String(process.env.RAZORPAY_KEY_SECRET || "").trim(),
  };
}
function timingSafeHexEqual(expected, received) {
  if (!/^[a-f\d]{64}$/i.test(String(received || ""))) return false;
  const expectedBytes = Buffer.from(expected, "hex");
  const receivedBytes = Buffer.from(received, "hex");
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}
async function razorpayRequest(path, options = {}) {
  const { keyId, keySecret } = razorpayCredentials();
  if (!keyId || !keySecret) throw new Error("Razorpay API credentials are not configured.");
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Razorpay returned an unreadable response.");
  }
  if (!response.ok) throw new Error("Razorpay API request failed.");
  return result;
}
function recordWalletCredit({ order, paymentId, amountPaise }) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = db
      .prepare("SELECT * FROM recharge_orders WHERE id = ?")
      .get(order.id);
    if (!current) throw new Error("Recharge order was not found.");
    if (current.status === "paid") {
      db.exec("COMMIT");
      return walletBalanceFor(current.user_id);
    }
    if (
      current.razorpay_order_id !== order.razorpay_order_id ||
      current.amount_paise !== amountPaise ||
      current.currency !== "INR"
    )
      throw new Error("Payment details do not match the recharge order.");
    const paidAt = new Date().toISOString();
    db.prepare(
      "UPDATE recharge_orders SET status = 'paid', razorpay_payment_id = ?, paid_at = ? WHERE id = ? AND status = 'created'",
    ).run(paymentId, paidAt, current.id);
    db.prepare(
      "INSERT INTO wallet_credits(id, user_id, recharge_order_id, razorpay_payment_id, amount_paise, created_at) VALUES(?,?,?,?,?,?)",
    ).run(randomBytes(16).toString("hex"), current.user_id, current.id, paymentId, amountPaise, paidAt);
    db.exec("COMMIT");
    return walletBalanceFor(current.user_id);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
function recordProductOrderPayment({ order, paymentId, amountPaise }) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = db
      .prepare("SELECT * FROM product_orders WHERE id = ?")
      .get(order.id);
    if (!current) throw new Error("Product order was not found.");
    if (current.status === "paid") {
      db.exec("COMMIT");
      return current;
    }
    if (
      current.razorpay_order_id !== order.razorpay_order_id ||
      current.amount_paise !== amountPaise ||
      current.currency !== "INR"
    )
      throw new Error("Payment details do not match the product order.");
    const paidAt = new Date().toISOString();
    db.prepare(
      "UPDATE product_orders SET status = 'paid', razorpay_payment_id = ?, paid_at = ? WHERE id = ? AND status = 'created'",
    ).run(paymentId, paidAt, current.id);
    const product = purchasableProducts.get(current.product_id);
    if (!product) throw new Error("Product plan details were not found.");
    db.prepare(`INSERT OR IGNORE INTO active_plans
      (id,user_id,product_id,amount_paise,daily_reward_paise,duration_days,purchased_at,payment_method)
      VALUES(?,?,?,?,?,?,?,'razorpay')`).run(
      current.id,
      current.user_id,
      current.product_id,
      current.amount_paise,
      product.dailyRewardPaise,
      product.durationDays,
      paidAt,
    );
    db.exec("COMMIT");
    return { ...current, status: "paid", razorpay_payment_id: paymentId, paid_at: paidAt };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
async function readRawBody(req, maxBytes = 65536) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > maxBytes)
      throw Object.assign(new Error("Request too large"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
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

async function paymentRoute(req, res, url) {
  if (url.pathname === "/api/payment/config" && req.method === "GET") {
    const { keyId, keySecret } = razorpayCredentials();
    const enabled = Boolean(keyId && keySecret);
    return send(res, 200, {
      enabled,
      key_id: enabled ? keyId : null,
      mode: keyId.startsWith("rzp_live_") ? "live" : "test",
    });
  }

  if (url.pathname === "/api/admin/withdrawals" && req.method === "GET") {
    const user = userForSession(req);
    if (!user) return send(res, 401, { error: "Sign in to open the admin panel." });
    if (!user.is_admin) return send(res, 403, { error: "Admin access is not enabled for this account." });
    const requests = db.prepare(`SELECT wr.id,wr.amount_paise,wr.status,wr.admin_decision,
      wr.created_at,wr.reviewed_at,wr.payout_method,wr.upi_id,wr.account_holder_name,
      wr.account_number,wr.ifsc_code,u.email,u.member_id
      FROM withdrawal_requests wr JOIN users u ON u.id=wr.user_id
      ORDER BY CASE WHEN wr.status='pending' AND wr.admin_decision='pending' THEN 0 ELSE 1 END,
        wr.created_at DESC LIMIT 100`).all().map((request) => ({
      id: request.id,
      amount_rupees: Math.floor(request.amount_paise / 100),
      status: request.admin_decision === "accepted" ? "accepted" : request.status,
      email: request.email,
      member_id: request.member_id,
      payout_method: request.payout_method,
      upi_id: request.upi_id,
      account_holder_name: request.account_holder_name,
      account_number: request.account_number,
      ifsc_code: request.ifsc_code,
      created_at: request.created_at,
      reviewed_at: request.reviewed_at,
    }));
    return send(res, 200, { requests });
  }

  const adminWithdrawalMatch = url.pathname.match(/^\/api\/admin\/withdrawals\/([a-f\d]{32})$/i);
  if (adminWithdrawalMatch && req.method === "POST") {
    if (!checkOrigin(req))
      return send(res, 403, { error: "Request origin not allowed" });
    if (rateLimited(req))
      return send(res, 429, { error: "Too many attempts. Please wait 15 minutes." });
    const user = userForSession(req);
    if (!user) return send(res, 401, { error: "Sign in to review withdrawal requests." });
    if (!user.is_admin) return send(res, 403, { error: "Admin access is not enabled for this account." });
    let body;
    try {
      body = await readJson(req);
    } catch (error) {
      return send(res, error.status || 400, { error: error.message });
    }
    const action = String(body.action || "").trim().toLowerCase();
    if (!["accept", "reject"].includes(action))
      return send(res, 400, { error: "Choose Accept or Reject." });
    db.exec("BEGIN IMMEDIATE");
    try {
      const request = db.prepare(`SELECT id,status,admin_decision FROM withdrawal_requests
        WHERE id=?`).get(adminWithdrawalMatch[1]);
      if (!request) {
        db.exec("ROLLBACK");
        return send(res, 404, { error: "Withdrawal request not found." });
      }
      if (request.status !== "pending" || request.admin_decision !== "pending") {
        db.exec("ROLLBACK");
        return send(res, 409, { error: "This withdrawal request has already been reviewed." });
      }
      const reviewedAt = new Date().toISOString();
      if (action === "accept")
        db.prepare(`UPDATE withdrawal_requests SET admin_decision='accepted',reviewed_at=?
          WHERE id=? AND status='pending' AND admin_decision='pending'`).run(reviewedAt, request.id);
      else
        db.prepare(`UPDATE withdrawal_requests SET status='rejected',admin_decision='rejected',reviewed_at=?
          WHERE id=? AND status='pending' AND admin_decision='pending'`).run(reviewedAt, request.id);
      db.exec("COMMIT");
      return send(res, 200, { ok: true, status: action === "accept" ? "accepted" : "rejected" });
    } catch (error) {
      db.exec("ROLLBACK");
      console.error("Could not review withdrawal request:", error);
      return send(res, 500, { error: "Could not review the withdrawal request." });
    }
  }

  if (url.pathname === "/api/account/transactions" && req.method === "GET") {
    const user = userForSession(req);
    if (!user) return send(res, 401, { error: "Sign in to view transactions." });
    const transactions = [];
    for (const purchase of db.prepare(`SELECT id,product_id,amount_paise,created_at
      FROM wallet_purchases WHERE user_id=?`).all(user.id)) {
      const product = purchasableProducts.get(purchase.product_id);
      transactions.push({
        id: purchase.id,
        type: "plan_purchase",
        title: product?.name || `Plan ${purchase.product_id}`,
        amount_rupees: Math.floor(purchase.amount_paise / 100),
        status: "paid",
        method: "Account balance",
        created_at: purchase.created_at,
      });
    }
    for (const order of db.prepare(`SELECT id,product_id,amount_paise,created_at,paid_at
      FROM product_orders WHERE user_id=? AND status='paid'`).all(user.id)) {
      const product = purchasableProducts.get(order.product_id);
      transactions.push({
        id: order.id,
        type: "plan_purchase",
        title: product?.name || `Plan ${order.product_id}`,
        amount_rupees: Math.floor(order.amount_paise / 100),
        status: "paid",
        method: "Razorpay",
        created_at: order.paid_at || order.created_at,
      });
    }
    for (const credit of db.prepare(`SELECT id,amount_paise,created_at
      FROM wallet_credits WHERE user_id=?`).all(user.id)) {
      transactions.push({
        id: credit.id,
        type: "recharge",
        title: "Store credit recharge",
        amount_rupees: Math.floor(credit.amount_paise / 100),
        status: "paid",
        method: "Razorpay",
        created_at: credit.created_at,
      });
    }
    for (const request of db.prepare(`SELECT id,amount_paise,status,admin_decision,created_at
      FROM withdrawal_requests WHERE user_id=?`).all(user.id)) {
      transactions.push({
        id: request.id,
        type: "withdrawal",
        title: "Reward withdrawal",
        amount_rupees: Math.floor(request.amount_paise / 100),
        status: request.admin_decision === "accepted" ? "accepted" : request.status,
        method: "Admin review",
        created_at: request.created_at,
      });
    }
    transactions.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return send(res, 200, { transactions: transactions.slice(0, 100) });
  }

  if (url.pathname === "/api/account/recharges" && req.method === "GET") {
    const user = userForSession(req);
    if (!user) return send(res, 401, { error: "Sign in to view recharge details." });
    const recharges = db.prepare(`SELECT id,amount_paise,created_at
      FROM wallet_credits WHERE user_id=? ORDER BY created_at DESC LIMIT 100`).all(user.id)
      .map((credit) => ({
        id: credit.id,
        amount_rupees: Math.floor(credit.amount_paise / 100),
        status: "paid",
        created_at: credit.created_at,
      }));
    return send(res, 200, {
      balance_rupees: walletBalanceFor(user.id),
      recharges,
    });
  }

  if (url.pathname === "/api/plans" && req.method === "GET") {
    const user = userForSession(req);
    if (!user) return send(res, 401, { error: "Sign in to view your plans." });
    return send(res, 200, plansOverviewFor(user.id));
  }

  if (url.pathname === "/api/withdrawals" && req.method === "GET") {
    const user = userForSession(req);
    if (!user) return send(res, 401, { error: "Sign in to view withdrawals." });
    const overview = plansOverviewFor(user.id);
    return send(res, 200, {
      rewards_available_rupees: overview.rewards_available_rupees,
      withdrawals: overview.withdrawals,
    });
  }

  if (url.pathname === "/api/withdrawals" && req.method === "POST") {
    if (!checkOrigin(req))
      return send(res, 403, { error: "Request origin not allowed" });
    if (rateLimited(req))
      return send(res, 429, { error: "Too many attempts. Please wait 15 minutes." });
    const user = userForSession(req);
    if (!user) return send(res, 401, { error: "Sign in before requesting a withdrawal." });
    let body;
    try {
      body = await readJson(req);
    } catch (error) {
      return send(res, error.status || 400, { error: error.message });
    }
    const amountRupees = Number(body.amount_rupees);
    if (!Number.isSafeInteger(amountRupees) || amountRupees < 1)
      return send(res, 400, { error: "Enter a whole-rupee amount of at least ₹1." });
    const payoutMethod = String(body.payout_method || "").trim().toLowerCase();
    let payoutDetails;
    if (payoutMethod === "upi") {
      const upiId = String(body.upi_id || "").trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,99}@[A-Za-z][A-Za-z0-9.-]{1,30}$/.test(upiId))
        return send(res, 400, { error: "Enter a valid UPI ID, such as name@bank." });
      payoutDetails = { payoutMethod, upiId, accountHolder: null, accountNumber: null, ifsc: null };
    } else if (payoutMethod === "bank") {
      const accountHolder = String(body.account_holder_name || "").trim();
      const accountNumber = String(body.account_number || "").trim();
      const ifsc = String(body.ifsc_code || "").trim().toUpperCase();
      if (accountHolder.length < 2 || accountHolder.length > 100)
        return send(res, 400, { error: "Enter the bank account holder name." });
      if (!/^\d{8,20}$/.test(accountNumber))
        return send(res, 400, { error: "Enter a valid bank account number (8–20 digits)." });
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc))
        return send(res, 400, { error: "Enter a valid 11-character IFSC code." });
      payoutDetails = { payoutMethod, upiId: null, accountHolder, accountNumber, ifsc };
    } else {
      return send(res, 400, { error: "Choose UPI or bank account for payout." });
    }

    accruePlanRewardsFor(user.id);
    const id = randomBytes(16).toString("hex");
    const amountPaise = amountRupees * 100;
    db.exec("BEGIN IMMEDIATE");
    try {
      const availablePaise = availableRewardsPaiseFor(user.id);
      if (amountPaise > availablePaise) {
        db.exec("ROLLBACK");
        return send(res, 402, {
          code: "INSUFFICIENT_REWARDS",
          error: "Withdrawal amount exceeds earned rewards available.",
          rewards_available_rupees: Math.floor(availablePaise / 100),
        });
      }
      db.prepare(`INSERT INTO withdrawal_requests
        (id,user_id,amount_paise,status,admin_decision,created_at,payout_method,upi_id,
          account_holder_name,account_number,ifsc_code)
        VALUES(?,?,?,'pending','pending',?,?,?,?,?,?)`).run(
        id,
        user.id,
        amountPaise,
        new Date().toISOString(),
        payoutDetails.payoutMethod,
        payoutDetails.upiId,
        payoutDetails.accountHolder,
        payoutDetails.accountNumber,
        payoutDetails.ifsc,
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      console.error("Could not create withdrawal request:", error);
      return send(res, 500, { error: "Could not create the withdrawal request. Please try again." });
    }
    const overview = plansOverviewFor(user.id);
    return send(res, 201, {
      request_id: id,
      status: "pending",
      amount_rupees: amountRupees,
      rewards_available_rupees: overview.rewards_available_rupees,
      withdrawals: overview.withdrawals,
    });
  }

  if (url.pathname === "/api/products/orders" && req.method === "POST") {
    if (!checkOrigin(req))
      return send(res, 403, { error: "Request origin not allowed" });
    if (rateLimited(req))
      return send(res, 429, { error: "Too many attempts. Please wait 15 minutes." });
    const user = userForSession(req);
    if (!user) return send(res, 401, { error: "Sign in before buying a product." });
    const { keyId, keySecret } = razorpayCredentials();
    if (!keyId || !keySecret)
      return send(res, 503, { error: "Razorpay payments are not configured yet." });

    let body;
    try {
      body = await readJson(req);
    } catch (error) {
      return send(res, error.status || 400, { error: error.message });
    }
    const productId = Number(body.product_id);
    const product = purchasableProducts.get(productId);
    if (!Number.isSafeInteger(productId) || !product)
      return send(res, 400, { error: "Choose a valid product." });

    try {
      const receipt = `buy_${randomBytes(16).toString("hex")}`;
      const razorpayOrder = await razorpayRequest("orders", {
        method: "POST",
        body: JSON.stringify({ amount: product.amountPaise, currency: "INR", receipt }),
      });
      if (
        !razorpayOrder.id ||
        razorpayOrder.amount !== product.amountPaise ||
        razorpayOrder.currency !== "INR"
      )
        throw new Error("Razorpay returned an order with unexpected details.");
      db.prepare(
        "INSERT INTO product_orders(id,user_id,product_id,amount_paise,currency,razorpay_order_id,status,created_at) VALUES(?,?,?,?,?,?,'created',?)",
      ).run(
        randomBytes(16).toString("hex"),
        user.id,
        productId,
        product.amountPaise,
        "INR",
        razorpayOrder.id,
        new Date().toISOString(),
      );
      return send(res, 201, {
        order_id: razorpayOrder.id,
        amount: product.amountPaise,
        currency: "INR",
        key_id: keyId,
        name: "Coco & Co.",
        description: product.name,
      });
    } catch (error) {
      console.error("Could not create product order:", error);
      return send(res, 502, { error: "Could not start product checkout. Please try again." });
    }
  }

  if (url.pathname === "/api/products/wallet-purchase" && req.method === "POST") {
    if (!checkOrigin(req))
      return send(res, 403, { error: "Request origin not allowed" });
    if (rateLimited(req))
      return send(res, 429, { error: "Too many attempts. Please wait 15 minutes." });
    const user = userForSession(req);
    if (!user) return send(res, 401, { error: "Sign in before buying a product." });

    let body;
    try {
      body = await readJson(req);
    } catch (error) {
      return send(res, error.status || 400, { error: error.message });
    }
    const productId = Number(body.product_id);
    const product = purchasableProducts.get(productId);
    if (!Number.isSafeInteger(productId) || !product)
      return send(res, 400, { error: "Choose a valid product." });

    db.exec("BEGIN IMMEDIATE");
    try {
      const balancePaise = walletBalancePaiseFor(user.id);
      if (balancePaise < product.amountPaise) {
        db.exec("ROLLBACK");
        return send(res, 402, {
          code: "INSUFFICIENT_BALANCE",
          error: "Account balance is not enough for this product.",
          balance_rupees: Math.floor(balancePaise / 100),
          required_rupees: product.amountPaise / 100,
        });
      }
      const purchaseId = randomBytes(16).toString("hex");
      const purchasedAt = new Date().toISOString();
      db.prepare(
        "INSERT INTO wallet_purchases(id,user_id,product_id,amount_paise,created_at) VALUES(?,?,?,?,?)",
      ).run(
        purchaseId,
        user.id,
        productId,
        product.amountPaise,
        purchasedAt,
      );
      db.prepare(`INSERT INTO active_plans
        (id,user_id,product_id,amount_paise,daily_reward_paise,duration_days,purchased_at,payment_method)
        VALUES(?,?,?,?,?,?,?,'wallet')`).run(
        purchaseId,
        user.id,
        productId,
        product.amountPaise,
        product.dailyRewardPaise,
        product.durationDays,
        purchasedAt,
      );
      db.exec("COMMIT");
      return send(res, 200, {
        status: "paid",
        payment_method: "wallet",
        product_name: product.name,
        balance_rupees: walletBalanceFor(user.id),
      });
    } catch (error) {
      db.exec("ROLLBACK");
      console.error("Could not complete wallet product purchase:", error);
      return send(res, 500, { error: "Could not complete the purchase. Please try again." });
    }
  }

  if (url.pathname === "/api/products/verify" && req.method === "POST") {
    if (!checkOrigin(req))
      return send(res, 403, { error: "Request origin not allowed" });
    const user = userForSession(req);
    if (!user) return send(res, 401, { error: "Sign in to verify this order." });
    let body;
    try {
      body = await readJson(req);
    } catch (error) {
      return send(res, error.status || 400, { error: error.message });
    }
    const orderId = String(body.razorpay_order_id || "");
    const paymentId = String(body.razorpay_payment_id || "");
    const signature = String(body.razorpay_signature || "");
    if (
      !/^order_[A-Za-z0-9]+$/.test(orderId) ||
      !/^pay_[A-Za-z0-9]+$/.test(paymentId)
    )
      return send(res, 400, { error: "Payment details are invalid." });
    const order = db
      .prepare("SELECT * FROM product_orders WHERE razorpay_order_id = ? AND user_id = ?")
      .get(orderId, user.id);
    if (!order) return send(res, 404, { error: "Product order was not found." });
    const { keySecret } = razorpayCredentials();
    if (!keySecret)
      return send(res, 503, { error: "Razorpay payments are not configured yet." });
    const expectedSignature = createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    if (!timingSafeHexEqual(expectedSignature, signature))
      return send(res, 400, { error: "Payment signature could not be verified." });
    if (order.status === "paid") return send(res, 200, { status: "paid" });

    try {
      const payment = await razorpayRequest(`payments/${encodeURIComponent(paymentId)}`);
      if (
        payment.order_id !== orderId ||
        payment.amount !== order.amount_paise ||
        payment.currency !== order.currency
      )
        return send(res, 400, { error: "Payment details do not match this order." });
      if (payment.status !== "captured")
        return send(res, 200, { status: "pending" });
      recordProductOrderPayment({ order, paymentId, amountPaise: payment.amount });
      return send(res, 200, {
        status: "paid",
        product_name: purchasableProducts.get(order.product_id).name,
      });
    } catch (error) {
      console.error("Could not verify product payment:", error);
      return send(res, 502, { error: "Could not verify payment yet. Please retry shortly." });
    }
  }

  if (url.pathname === "/api/recharge/orders" && req.method === "POST") {
    if (!checkOrigin(req))
      return send(res, 403, { error: "Request origin not allowed" });
    if (rateLimited(req))
      return send(res, 429, { error: "Too many attempts. Please wait 15 minutes." });
    const user = userForSession(req);
    if (!user) return send(res, 401, { error: "Sign in to add store credit." });
    const { keyId, keySecret } = razorpayCredentials();
    if (!keyId || !keySecret)
      return send(res, 503, { error: "Razorpay payments are not configured yet." });

    let body;
    try {
      body = await readJson(req);
    } catch (error) {
      return send(res, error.status || 400, { error: error.message });
    }
    const amountRupees = Number(body.amount_rupees);
    const amountPaise = amountRupees * 100;
    if (
      !Number.isSafeInteger(amountRupees) ||
      amountRupees < 100 ||
      !Number.isSafeInteger(amountPaise)
    )
      return send(res, 400, { error: "Enter a whole-rupee amount of at least ₹100." });

    try {
      const receipt = `rcg_${randomBytes(16).toString("hex")}`;
      const razorpayOrder = await razorpayRequest("orders", {
        method: "POST",
        body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt }),
      });
      if (
        !razorpayOrder.id ||
        razorpayOrder.amount !== amountPaise ||
        razorpayOrder.currency !== "INR"
      )
        throw new Error("Razorpay returned an order with unexpected details.");
      const localOrderId = randomBytes(16).toString("hex");
      db.prepare(
        "INSERT INTO recharge_orders(id,user_id,amount_paise,currency,razorpay_order_id,status,created_at) VALUES(?,?,?,?,?,'created',?)",
      ).run(localOrderId, user.id, amountPaise, "INR", razorpayOrder.id, new Date().toISOString());
      return send(res, 201, {
        order_id: razorpayOrder.id,
        amount: amountPaise,
        currency: "INR",
        key_id: keyId,
        name: "Coco & Co.",
        description: "Chocolate store credit",
      });
    } catch (error) {
      console.error("Could not create Razorpay order:", error);
      return send(res, 502, { error: "Could not start payment. Please try again." });
    }
  }

  if (url.pathname === "/api/recharge/verify" && req.method === "POST") {
    if (!checkOrigin(req))
      return send(res, 403, { error: "Request origin not allowed" });
    const user = userForSession(req);
    if (!user) return send(res, 401, { error: "Sign in to verify this payment." });
    let body;
    try {
      body = await readJson(req);
    } catch (error) {
      return send(res, error.status || 400, { error: error.message });
    }
    const orderId = String(body.razorpay_order_id || "");
    const paymentId = String(body.razorpay_payment_id || "");
    const signature = String(body.razorpay_signature || "");
    if (
      !/^order_[A-Za-z0-9]+$/.test(orderId) ||
      !/^pay_[A-Za-z0-9]+$/.test(paymentId)
    )
      return send(res, 400, { error: "Payment details are invalid." });
    const order = db
      .prepare("SELECT * FROM recharge_orders WHERE razorpay_order_id = ? AND user_id = ?")
      .get(orderId, user.id);
    if (!order) return send(res, 404, { error: "Recharge order was not found." });

    const { keySecret } = razorpayCredentials();
    if (!keySecret)
      return send(res, 503, { error: "Razorpay payments are not configured yet." });
    const expectedSignature = createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    if (!timingSafeHexEqual(expectedSignature, signature))
      return send(res, 400, { error: "Payment signature could not be verified." });

    if (order.status === "paid")
      return send(res, 200, {
        status: "paid",
        balance_rupees: walletBalanceFor(user.id),
      });

    try {
      const payment = await razorpayRequest(`payments/${encodeURIComponent(paymentId)}`);
      if (
        payment.order_id !== orderId ||
        payment.amount !== order.amount_paise ||
        payment.currency !== "INR"
      )
        return send(res, 400, { error: "Payment details do not match this recharge." });
      if (payment.status !== "captured")
        return send(res, 200, {
          status: "pending",
          balance_rupees: walletBalanceFor(user.id),
        });
      const balance = recordWalletCredit({
        order,
        paymentId,
        amountPaise: payment.amount,
      });
      return send(res, 200, { status: "paid", balance_rupees: balance });
    } catch (error) {
      console.error("Could not verify Razorpay payment:", error);
      return send(res, 502, { error: "Could not verify payment yet. Please retry shortly." });
    }
  }

  if (url.pathname === "/api/recharge/status" && req.method === "GET") {
    const user = userForSession(req);
    if (!user) return send(res, 401, { error: "Sign in to view store credit." });
    const orderId = url.searchParams.get("order_id") || "";
    const order = db
      .prepare("SELECT status FROM recharge_orders WHERE razorpay_order_id = ? AND user_id = ?")
      .get(orderId, user.id);
    if (!order) return send(res, 404, { error: "Recharge order was not found." });
    return send(res, 200, {
      status: order.status === "paid" ? "paid" : "pending",
      balance_rupees: walletBalanceFor(user.id),
    });
  }

  return false;
}

async function razorpayWebhookRoute(req, res) {
  const secret = String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  if (!secret)
    return send(res, 503, { error: "Razorpay webhook is not configured." });
  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (error) {
    return send(res, error.status || 400, { error: error.message });
  }
  const signature = String(req.headers["x-razorpay-signature"] || "");
  const expectedSignature = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!timingSafeHexEqual(expectedSignature, signature))
    return send(res, 400, { error: "Webhook signature could not be verified." });
  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return send(res, 400, { error: "Invalid webhook payload." });
  }
  if (event.event !== "payment.captured") return send(res, 200, { ok: true });
  const payment = event.payload?.payment?.entity;
  if (!payment?.order_id || !payment?.id) return send(res, 200, { ok: true });
  const order = db
    .prepare("SELECT * FROM recharge_orders WHERE razorpay_order_id = ?")
    .get(payment.order_id);
  if (!order) {
    const productOrder = db
      .prepare("SELECT * FROM product_orders WHERE razorpay_order_id = ?")
      .get(payment.order_id);
    if (!productOrder) return send(res, 200, { ok: true });
    if (
      payment.status !== "captured" ||
      payment.amount !== productOrder.amount_paise ||
      payment.currency !== productOrder.currency
    ) {
      console.error("Ignoring captured-payment webhook with mismatched product order details.");
      return send(res, 200, { ok: true });
    }
    try {
      recordProductOrderPayment({
        order: productOrder,
        paymentId: payment.id,
        amountPaise: payment.amount,
      });
      return send(res, 200, { ok: true });
    } catch (error) {
      console.error("Could not apply Razorpay product-order webhook:", error);
      return send(res, 500, { error: "Could not process webhook." });
    }
  }
  if (
    payment.status !== "captured" ||
    payment.amount !== order.amount_paise ||
    payment.currency !== order.currency
  ) {
    console.error("Ignoring captured-payment webhook with mismatched details.");
    return send(res, 200, { ok: true });
  }
  try {
    recordWalletCredit({ order, paymentId: payment.id, amountPaise: payment.amount });
    return send(res, 200, { ok: true });
  } catch (error) {
    console.error("Could not apply Razorpay payment webhook:", error);
    return send(res, 500, { error: "Could not process webhook." });
  }
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
      if (url.pathname === "/api/webhooks/razorpay" && req.method === "POST")
        return await razorpayWebhookRoute(req, res);
      const paymentHandled = await paymentRoute(req, res, url);
      if (paymentHandled !== false) return;
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
