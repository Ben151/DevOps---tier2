/**
 * Smart Parking - API server (Node.js + Express + Redis)
 *
 * Endpoints:
 *   GET  /api/health              -> health check (docker healthcheck / CI)
 *   POST /api/cars                -> camera reports a car entering   {"plate": "12-345-67"}
 *   GET  /api/cars                -> dashboard: cars currently parked
 *   POST /api/cars/:plate/exit    -> release a car, returns the price to pay
 *   GET  /api/stats               -> occupancy, capacity, total entries, revenue
 *   GET  /api/history             -> last cars that left
 *
 * Redis keys:
 *   car:<plate>       HASH        details of a parked car
 *   parking:active    SORTED SET  plates inside, score = entry timestamp (seconds)
 *   parking:history   LIST        JSON of cars that left (newest first, max 50)
 *   stats:entries     STRING      counter of all entries ever
 *   stats:revenue     STRING      total money collected
 */

const express = require("express");
const { createClient } = require("redis");

// ---- configuration from environment variables (set in docker-compose.yml) ----
const PORT = Number(process.env.PORT || 3000);
const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";
const CAPACITY = Number(process.env.PARKING_CAPACITY || 10);
const PRICE_FIRST_HOUR = Number(process.env.PRICE_FIRST_HOUR || 12);
const PRICE_EXTRA_HOUR = Number(process.env.PRICE_EXTRA_HOUR || 8);
const FREE_MINUTES = Number(process.env.FREE_MINUTES || 15);

const app = express();
app.use(express.json()); // parse JSON bodies into req.body

// disableOfflineQueue: if Redis is down, fail immediately (-> 503/500) instead of waiting forever
const db = createClient({ url: REDIS_URL, disableOfflineQueue: true });
db.on("error", (err) => console.error("[redis]", err.message));

// ---------- helpers ----------

// Israeli plates: 7 or 8 digits, dashes/spaces optional (12-345-67 / 123-45-678)
function normalizePlate(raw) {
  const digits = String(raw ?? "").replace(/[\s-]/g, "");
  return /^\d{7,8}$/.test(digits) ? digits : null;
}

// 1234567 -> 12-345-67 , 12345678 -> 123-45-678
function formatPlate(d) {
  return d.length === 7
    ? `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`
    : `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

// first FREE_MINUTES are free, then first hour + every started extra hour
function calcPrice(minutes) {
  if (minutes <= FREE_MINUTES) return 0;
  const hours = Math.ceil(minutes / 60);
  return PRICE_FIRST_HOUR + Math.max(0, hours - 1) * PRICE_EXTRA_HOUR;
}

const nowSec = () => Date.now() / 1000;

function carView(plate, enteredAt, now) {
  const minutes = Math.floor((now - enteredAt) / 60);
  return {
    plate: formatPlate(plate),
    entered_at: Math.floor(enteredAt),
    minutes,
    price_now: calcPrice(minutes),
  };
}

// ---------- routes ----------

app.get("/api/health", async (req, res) => {
  try {
    if (!db.isReady) throw new Error("redis not connected");
    await db.ping();
    res.json({ status: "ok", redis: "up" });
  } catch {
    res.status(503).json({ status: "error", redis: "down" });
  }
});

app.post("/api/cars", async (req, res) => {
  const plate = normalizePlate(req.body?.plate);
  if (!plate) return res.status(400).json({ error: "invalid plate, expected 7-8 digits" });

  if ((await db.zScore("parking:active", plate)) !== null) {
    return res.status(409).json({ error: "car already inside", plate: formatPlate(plate) });
  }
  if ((await db.zCard("parking:active")) >= CAPACITY) {
    return res.status(409).json({ error: "parking is full", capacity: CAPACITY });
  }

  const now = nowSec();
  // MULTI/EXEC: all commands run together as one transaction
  await db
    .multi()
    .hSet(`car:${plate}`, { plate, entered_at: String(now) })
    .zAdd("parking:active", { score: now, value: plate })
    .incr("stats:entries")
    .exec();

  res.status(201).json(carView(plate, now, now));
});

app.get("/api/cars", async (req, res) => {
  const now = nowSec();
  // newest first
  const rows = await db.zRangeWithScores("parking:active", 0, -1, { REV: true });
  res.json(rows.map((r) => carView(r.value, r.score, now)));
});

app.post("/api/cars/:plate/exit", async (req, res) => {
  const plate = normalizePlate(req.params.plate);
  if (!plate) return res.status(400).json({ error: "invalid plate" });

  const enteredAt = await db.zScore("parking:active", plate);
  if (enteredAt === null) return res.status(404).json({ error: "car not found" });

  const now = nowSec();
  const view = carView(plate, enteredAt, now);
  const record = { ...view, exited_at: Math.floor(now), paid: view.price_now };

  await db
    .multi()
    .zRem("parking:active", plate)
    .del(`car:${plate}`)
    .lPush("parking:history", JSON.stringify(record))
    .lTrim("parking:history", 0, 49) // keep only last 50
    .incrByFloat("stats:revenue", record.paid)
    .exec();

  res.json(record);
});

app.get("/api/stats", async (req, res) => {
  const [occupied, entries, revenue] = await Promise.all([
    db.zCard("parking:active"),
    db.get("stats:entries"),
    db.get("stats:revenue"),
  ]);
  res.json({
    occupied,
    capacity: CAPACITY,
    free: Math.max(0, CAPACITY - occupied),
    is_full: occupied >= CAPACITY,
    total_entries: Number(entries || 0),
    revenue: Number(revenue || 0),
    pricing: { free_minutes: FREE_MINUTES, first_hour: PRICE_FIRST_HOUR, extra_hour: PRICE_EXTRA_HOUR },
  });
});

app.get("/api/history", async (req, res) => {
  const rows = await db.lRange("parking:history", 0, 19);
  res.json(rows.map((x) => JSON.parse(x)));
});

// any error thrown inside a route (e.g. Redis down) ends here instead of crashing the server
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "body is not valid JSON" });
  }
  console.error("[api]", err.message);
  res.status(500).json({ error: "internal server error" });
});

// ---------- start ----------
async function main() {
  await db.connect();
  const server = app.listen(PORT, () => console.log(`[api] listening on :${PORT}, redis: ${REDIS_URL}`));

  // graceful shutdown: "docker compose down" sends SIGTERM
  process.on("SIGTERM", async () => {
    console.log("[api] SIGTERM - shutting down");
    server.close();
    await db.quit();
    process.exit(0);
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[api] failed to start:", err.message);
    process.exit(1);
  });
}

module.exports = { app, normalizePlate, formatPlate, calcPrice };
