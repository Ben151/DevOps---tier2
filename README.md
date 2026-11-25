# 🚀 Smart Parking License Plate Tracker — Galactic Edition

![CI](../../actions/workflows/ci.yml/badge.svg)
![Publish](../../actions/workflows/publish.yml/badge.svg)

מערכת לניהול כניסת רכבים לחניון חכם — **Track 2: Full Stack DevOps**.
מצלמת IoT מפענחת לוחית רישוי ושולחת `HTTP POST` לשרת ה-API (Node.js), הנתונים נשמרים ב-Redis,
ולוח הבקרה של השומר (HTML + CSS + JavaScript) מתעדכן בזמן אמת עם `fetch` — בלי לרענן את העמוד.

> **הטאץ' האישי שלנו:** "חניון החלליות" — מצב חלל עם כוכבים מונפשים, הודעות מצחיקות על כל רכב שנוחת/ממריא,
> תמחור חניה לפי שעות, כפתור שחרור רכב, התראת חניון מלא, ו-Easter Egg חבוי (רמז: מה התשובה לחיים, ליקום ולכל השאר? 🤫)

**Stack:** JavaScript בלבד — Node.js + Express בשרת, HTML/CSS/JS בלקוח, Nginx, Redis.

---

## 🏗️ ארכיטקטורה

```
 IoT Camera ── HTTP POST /api/cars ──┐
 (או כפתור "סימולציית מצלמה")         │
                                      ▼
┌─────────┐   :8080   ┌──────────────┐  /api/*   ┌────────────────┐        ┌──────────────┐
│ Browser │ ────────► │  web (Nginx) │ ────────► │  api (Node.js) │ ─────► │    Redis     │
│ (שומר)  │ ◄──────── │ HTML/CSS/JS  │  proxy    │    Express     │        │ AOF + Volume │
└─────────┘           └──────────────┘           └────────────────┘        └──────┬───────┘
                       network: frontend          frontend + backend               │
                                                                        volume: redis-data
```

| שירות | Image | תפקיד | פורט |
|---|---|---|---|
| `web` | `nginx:1.27-alpine` | מגיש את לוח הבקרה + Reverse Proxy ל-API | `8080` → `80` (היחיד שפתוח החוצה) |
| `api` | `node:22-alpine` | Express: `POST` מהמצלמה, `GET` ללוח הבקרה | `3000` (פנימי בלבד) |
| `redis` | `redis:7-alpine` | DB — שמירה לקובץ AOF ב-Volume | `6379` (פנימי בלבד) |

הסבר מפורט על ההחלטות: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## ▶️ הרצה

דרישות: Docker + Docker Compose.

```bash
git clone https://github.com/<OWNER>/<REPO>.git
cd <REPO>
cp .env.example .env          # אופציונלי - שינוי קיבולת/מחירים/פורט

docker compose up -d --build
# פתחו בדפדפן: http://localhost:8080
```

עצירה:

```bash
docker compose down        # עוצר ומוחק קונטיינרים - הנתונים נשארים ב-Volume
docker compose down -v     # ⚠️ מוחק גם את ה-Volume = כל הנתונים
```

---

## 🔌 API

| Method | Endpoint | תיאור |
|---|---|---|
| `GET` | `/api/health` | בדיקת תקינות (כולל חיבור ל-Redis) |
| `POST` | `/api/cars` | כניסת רכב — body: `{"plate": "12-345-67"}` |
| `GET` | `/api/cars` | רשימת הרכבים בחניון + זמן חניה + מחיר נוכחי |
| `POST` | `/api/cars/:plate/exit` | שחרור רכב — מחזיר את הסכום לתשלום |
| `GET` | `/api/stats` | תפוסה, קיבולת, מקומות פנויים, כניסות, הכנסות |
| `GET` | `/api/history` | 20 הרכבים האחרונים שיצאו |

קודי תשובה: `201` נכנס · `400` לוחית / JSON לא תקינים · `404` רכב לא נמצא · `409` רכב כבר בפנים / חניון מלא · `503` אין חיבור ל-Redis.

"המצלמה" שולחת רכב:

```bash
curl -X POST http://localhost:8080/api/cars \
     -H "Content-Type: application/json" \
     -d '{"plate":"12-345-67"}'
```

**תמחור** (ניתן לשינוי ב-`.env`): 15 דקות ראשונות חינם · שעה ראשונה ₪12 · כל שעה נוספת שהתחילה ₪8.

---

## 💾 Data Persistence — הוכחה לדמו

```bash
docker compose up -d
curl -X POST localhost:8080/api/cars -H "Content-Type: application/json" -d '{"plate":"12-345-67"}'

docker compose down            # הקונטיינרים נמחקים
docker volume ls               # ה-Volume  <project>_redis-data  עדיין קיים
docker compose up -d

curl localhost:8080/api/cars   # הרכב 12-345-67 עדיין שם ✅
```

למה זה עובד? Redis רץ עם `--appendonly yes` — כל פקודת כתיבה נרשמת לקובץ AOF בתיקייה `/data`,
והתיקייה הזאת ממופה ל-Named Volume בשם `redis-data` שחי מחוץ למחזור החיים של הקונטיינר.

---

## ⚙️ CI/CD — GitHub Actions

| Workflow | מתי רץ | מה עושה |
|---|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | כל `push` ו-PR | בונה את 2 ה-Images במקביל (matrix), ואז מריץ את כל ה-Stack עם Compose, בודק את ה-API דרך Nginx, ומוודא שהנתונים שורדים `down`/`up` |
| [`publish.yml`](.github/workflows/publish.yml) | `push` ל-`main` / תג `v*.*.*` | **בונוס:** התחברות ל-`ghcr.io` עם `GITHUB_TOKEN`, תיוג אוטומטי, ודחיפה ל-GitHub Container Registry |

תגיות שנוצרות אוטומטית: `latest`, `1.0.<run_number>`, `sha-<commit>`, ובתג גיט `v1.2.0` → `1.2.0` + `1.2`.

```bash
git tag v1.0.0
git push origin v1.0.0
docker pull ghcr.io/<owner>/<repo>-api:latest
```

---

## 📁 מבנה הפרויקט

```
.
├── api/                    # Backend - Node.js + Express + Redis
│   ├── server.js
│   ├── package.json
│   ├── package-lock.json
│   ├── Dockerfile
│   └── .dockerignore
├── web/                    # Frontend - Nginx
│   ├── index.html
│   ├── style.css
│   ├── app.js              # fetch + polling + dynamic DOM
│   ├── fun.css / fun.js    # הטאץ' האישי: מצב חלל, הודעות, Easter Egg
│   ├── nginx.conf
│   └── Dockerfile
├── .github/workflows/
│   ├── ci.yml
│   └── publish.yml
├── docker-compose.yml
├── .env.example
├── README.md
├── ARCHITECTURE.md
└── AI_USAGE.md
```

הרצת ה-API מקומית בלי Docker (לפיתוח):

```bash
cd api && npm install
REDIS_URL=redis://localhost:6379 npm start
```

---

## 👥 הצוות

## 👥 Team
בן קרן
איתי עזימי
טל קפלן
איידל סרבטר

תיעוד שימוש ב-AI: [AI_USAGE.md](AI_USAGE.md)
