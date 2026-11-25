/**
 * Smart Parking - שרת ה-API (Node.js + Express + Redis)
 *
 * נקודות קצה (Endpoints):
 *   GET  /api/health              -> בדיקת בריאות (healthcheck של Docker / CI)
 *   POST /api/cars                -> המצלמה מדווחת על רכב שנכנס   {"plate": "12-345-67"}
 *   GET  /api/cars                -> לוח הבקרה: הרכבים שחונים כרגע
 *   POST /api/cars/:plate/exit    -> שחרור רכב, מחזיר את המחיר לתשלום
 *   GET  /api/stats               -> תפוסה, קיבולת, סה"כ כניסות, הכנסות
 *   GET  /api/history             -> הרכבים האחרונים שיצאו
 *
 * מפתחות ב-Redis:
 *   car:<plate>       HASH        פרטי רכב שחונה כרגע
 *   parking:active    SORTED SET  מספרי הרישוי שבפנים, score = זמן הכניסה (בשניות)
 *   parking:history   LIST        JSON של רכבים שיצאו (החדש ראשון, מקסימום 50)
 *   stats:entries     STRING      מונה של כל הכניסות אי פעם
 *   stats:revenue     STRING      סך כל הכסף שנגבה
 */

const express = require("express"); // טוענים את ספריית Express לבניית שרת HTTP
const { createClient } = require("redis"); // טוענים מספריית redis את הפונקציה שיוצרת חיבור

// ---- הגדרות ממשתני סביבה (מוגדרים ב-docker-compose.yml) ----
const PORT = Number(process.env.PORT || 3000); // הפורט שהשרת מאזין לו, ברירת מחדל 3000
const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379"; // כתובת ה-Redis, ברירת מחדל לשירות redis
const CAPACITY = Number(process.env.PARKING_CAPACITY || 10); // מספר המקומות בחניון
const PRICE_FIRST_HOUR = Number(process.env.PRICE_FIRST_HOUR || 12); // מחיר השעה הראשונה
const PRICE_EXTRA_HOUR = Number(process.env.PRICE_EXTRA_HOUR || 8); // מחיר כל שעה נוספת
const FREE_MINUTES = Number(process.env.FREE_MINUTES || 15); // מספר דקות החינם

const app = express(); // יוצרים את אפליקציית Express
app.use(express.json()); // middleware שמפענח גוף בקשה בפורמט JSON לתוך req.body

// disableOfflineQueue: אם Redis למטה - נכשלים מיד (-> 503/500) במקום לחכות לנצח
const db = createClient({ url: REDIS_URL, disableOfflineQueue: true }); // יוצרים לקוח Redis (עוד לא מתחבר)
db.on("error", (err) => console.error("[redis]", err.message)); // מדפיסים שגיאות חיבור במקום שהתהליך יקרוס

// ---------- פונקציות עזר ----------

// לוחיות ישראליות: 7 או 8 ספרות, מקפים/רווחים אופציונליים (12-345-67 / 123-45-678)
function normalizePlate(raw) { // מקבלת מספר רישוי גולמי ומחזירה רק ספרות, או null אם לא תקין
  const digits = String(raw ?? "").replace(/[\s-]/g, ""); // ממירים למחרוזת (null -> "") ומוחקים רווחים ומקפים
  return /^\d{7,8}$/.test(digits) ? digits : null; // תקין רק אם נשארו בדיוק 7 או 8 ספרות
} // סוף normalizePlate

// 1234567 -> 12-345-67 , 12345678 -> 123-45-678
function formatPlate(d) { // מקבלת ספרות בלבד ומחזירה מספר רישוי מעוצב עם מקפים
  return d.length === 7 // בודקים אם זו לוחית של 7 ספרות
    ? `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}` // 7 ספרות: 2-3-2
    : `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`; // 8 ספרות: 3-2-3
} // סוף formatPlate

// הדקות הראשונות (FREE_MINUTES) בחינם, אחר כך שעה ראשונה + כל שעה נוספת שהתחילה
function calcPrice(minutes) { // מחשבת את המחיר לפי מספר הדקות
  if (minutes <= FREE_MINUTES) return 0; // בתוך זמן החינם - לא משלמים
  const hours = Math.ceil(minutes / 60); // מספר השעות, מעוגל כלפי מעלה (שעה שהתחילה = שעה מלאה)
  return PRICE_FIRST_HOUR + Math.max(0, hours - 1) * PRICE_EXTRA_HOUR; // שעה ראשונה + מחיר לכל שעה נוספת
} // סוף calcPrice

const nowSec = () => Date.now() / 1000; // הזמן הנוכחי בשניות (Date.now מחזיר מילישניות)

function carView(plate, enteredAt, now) { // בונה אובייקט רכב להחזרה ללקוח
  const minutes = Math.floor((now - enteredAt) / 60); // כמה דקות שלמות הרכב בחניון
  return { // מחזירים אובייקט עם השדות הבאים:
    plate: formatPlate(plate), // מספר הרישוי המעוצב
    entered_at: Math.floor(enteredAt), // זמן הכניסה בשניות שלמות
    minutes, // משך החניה בדקות
    price_now: calcPrice(minutes), // המחיר לתשלום אם יצא עכשיו
  }; // סוף האובייקט
} // סוף carView

// ---------- נתיבים (routes) ----------

app.get("/api/health", async (req, res) => { // נתיב בדיקת בריאות
  try { // מנסים לבדוק את Redis
    if (!db.isReady) throw new Error("redis not connected"); // אם הלקוח לא מחובר - זורקים שגיאה
    await db.ping(); // שולחים PING ל-Redis ומחכים לתשובה
    res.json({ status: "ok", redis: "up" }); // הכל תקין - מחזירים 200
  } catch { // אם משהו נכשל
    res.status(503).json({ status: "error", redis: "down" }); // מחזירים 503 = השירות לא זמין
  } // סוף try/catch
}); // סוף נתיב health

app.post("/api/cars", async (req, res) => { // נתיב כניסת רכב (המצלמה שולחת לכאן)
  const plate = normalizePlate(req.body?.plate); // לוקחים את מספר הרישוי מגוף הבקשה ומנרמלים
  if (!plate) return res.status(400).json({ error: "invalid plate, expected 7-8 digits" }); // לא תקין -> 400

  if ((await db.zScore("parking:active", plate)) !== null) { // אם יש לרכב score בסט = הוא כבר בפנים
    return res.status(409).json({ error: "car already inside", plate: formatPlate(plate) }); // 409 = התנגשות
  } // סוף בדיקת רכב כפול
  if ((await db.zCard("parking:active")) >= CAPACITY) { // סופרים כמה רכבים בפנים ובודקים מול הקיבולת
    return res.status(409).json({ error: "parking is full", capacity: CAPACITY }); // החניון מלא -> 409
  } // סוף בדיקת חניון מלא

  const now = nowSec(); // זמן הכניסה
  // MULTI/EXEC: כל הפקודות רצות יחד כטרנזקציה אחת
  await db // מתחילים שרשרת פקודות על החיבור ל-Redis
    .multi() // פותחים טרנזקציה
    .hSet(`car:${plate}`, { plate, entered_at: String(now) }) // שומרים HASH עם פרטי הרכב
    .zAdd("parking:active", { score: now, value: plate }) // מוסיפים לסט הממוין של הרכבים בפנים, score = זמן כניסה
    .incr("stats:entries") // מגדילים ב-1 את מונה הכניסות
    .exec(); // מריצים את כל הטרנזקציה

  res.status(201).json(carView(plate, now, now)); // מחזירים 201 = נוצר, עם פרטי הרכב
}); // סוף נתיב כניסת רכב

app.get("/api/cars", async (req, res) => { // נתיב רשימת הרכבים שבחניון
  const now = nowSec(); // הזמן הנוכחי לחישוב משך החניה
  // החדש ראשון
  const rows = await db.zRangeWithScores("parking:active", 0, -1, { REV: true }); // כל הרכבים עם זמני הכניסה, בסדר הפוך
  res.json(rows.map((r) => carView(r.value, r.score, now))); // ממירים כל שורה לאובייקט רכב ומחזירים מערך
}); // סוף נתיב רשימת רכבים

app.post("/api/cars/:plate/exit", async (req, res) => { // נתיב יציאת רכב
  const plate = normalizePlate(req.params.plate); // לוקחים את מספר הרישוי מה-URL ומנרמלים
  if (!plate) return res.status(400).json({ error: "invalid plate" }); // לא תקין -> 400

  const enteredAt = await db.zScore("parking:active", plate); // מביאים את זמן הכניסה של הרכב
  if (enteredAt === null) return res.status(404).json({ error: "car not found" }); // הרכב לא בחניון -> 404

  const now = nowSec(); // זמן היציאה
  const view = carView(plate, enteredAt, now); // מחשבים משך ומחיר
  const record = { ...view, exited_at: Math.floor(now), paid: view.price_now }; // רשומת היסטוריה: פרטי הרכב + זמן יציאה + סכום ששולם

  await db // שרשרת פקודות ל-Redis
    .multi() // פותחים טרנזקציה
    .zRem("parking:active", plate) // מוציאים את הרכב מסט הרכבים שבפנים
    .del(`car:${plate}`) // מוחקים את ה-HASH של פרטי הרכב
    .lPush("parking:history", JSON.stringify(record)) // מוסיפים את הרשומה לתחילת רשימת ההיסטוריה
    .lTrim("parking:history", 0, 49) // משאירים רק את 50 האחרונים
    .incrByFloat("stats:revenue", record.paid) // מוסיפים את התשלום לסך ההכנסות
    .exec(); // מריצים את הטרנזקציה

  res.json(record); // מחזירים ללקוח את רשומת היציאה (כולל המחיר)
}); // סוף נתיב יציאת רכב

app.get("/api/stats", async (req, res) => { // נתיב הסטטיסטיקות
  const [occupied, entries, revenue] = await Promise.all([ // מריצים 3 שאילתות במקביל ומחכים לכולן
    db.zCard("parking:active"), // כמה רכבים בפנים כרגע
    db.get("stats:entries"), // מונה הכניסות
    db.get("stats:revenue"), // סך ההכנסות
  ]); // סוף Promise.all
  res.json({ // מחזירים אובייקט סטטיסטיקות:
    occupied, // מקומות תפוסים
    capacity: CAPACITY, // קיבולת כוללת
    free: Math.max(0, CAPACITY - occupied), // מקומות פנויים (לא פחות מ-0)
    is_full: occupied >= CAPACITY, // האם החניון מלא
    total_entries: Number(entries || 0), // סה"כ כניסות (0 אם המפתח עוד לא קיים)
    revenue: Number(revenue || 0), // סה"כ הכנסות (0 אם המפתח עוד לא קיים)
    pricing: { free_minutes: FREE_MINUTES, first_hour: PRICE_FIRST_HOUR, extra_hour: PRICE_EXTRA_HOUR }, // פרטי התמחור לתצוגה
  }); // סוף התשובה
}); // סוף נתיב stats

app.get("/api/history", async (req, res) => { // נתיב ההיסטוריה
  const rows = await db.lRange("parking:history", 0, 19); // מביאים את 20 הרשומות האחרונות
  res.json(rows.map((x) => JSON.parse(x))); // ממירים כל מחרוזת JSON לאובייקט ומחזירים מערך
}); // סוף נתיב history

// כל שגיאה שנזרקת בתוך נתיב (למשל Redis למטה) מגיעה לכאן במקום להפיל את השרת
app.use((err, req, res, next) => { // middleware לטיפול בשגיאות (4 פרמטרים = error handler ב-Express)
  if (err.type === "entity.parse.failed") { // שגיאה מ-express.json: הגוף שנשלח אינו JSON תקין
    return res.status(400).json({ error: "body is not valid JSON" }); // מחזירים 400 = בקשה שגויה
  } // סוף בדיקת JSON
  console.error("[api]", err.message); // מדפיסים את השגיאה ללוג
  res.status(500).json({ error: "internal server error" }); // מחזירים 500 = שגיאת שרת
}); // סוף error handler

// ---------- הפעלה ----------
async function main() { // פונקציית ההפעלה הראשית
  await db.connect(); // מתחברים ל-Redis (אם נכשל - נזרקת שגיאה)
  const server = app.listen(PORT, () => console.log(`[api] listening on :${PORT}, redis: ${REDIS_URL}`)); // מתחילים להאזין לפורט ומדפיסים הודעה

  // כיבוי מסודר: "docker compose down" שולח SIGTERM
  process.on("SIGTERM", async () => { // מאזינים לאות SIGTERM מ-Docker
    console.log("[api] SIGTERM - shutting down"); // הודעה ללוג
    server.close(); // מפסיקים לקבל בקשות חדשות
    await db.quit(); // סוגרים את החיבור ל-Redis בצורה מסודרת
    process.exit(0); // יוצאים מהתהליך עם קוד הצלחה
  }); // סוף מאזין SIGTERM
} // סוף main

if (require.main === module) { // רק אם הקובץ הורץ ישירות (node server.js) ולא יובא מקובץ אחר (למשל בטסטים)
  main().catch((err) => { // מפעילים את main ותופסים שגיאה בהפעלה
    console.error("[api] failed to start:", err.message); // מדפיסים למה ההפעלה נכשלה
    process.exit(1); // יוצאים עם קוד כישלון - Docker יפעיל מחדש (restart: unless-stopped)
  }); // סוף catch
} // סוף בדיקת הרצה ישירה

module.exports = { app, normalizePlate, formatPlate, calcPrice }; // מייצאים את האפליקציה ופונקציות העזר לשימוש בטסטים
