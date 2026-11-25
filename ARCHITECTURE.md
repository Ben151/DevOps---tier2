# החלטות ארכיטקטוניות

מסמך זה מסביר **למה** בחרנו כל דבר — חומר הכנה ל-Code Review.

## 1. JavaScript מקצה לקצה (Node.js + Express)
אותה שפה בשרת ובדפדפן. Express הוא Framework מינימלי — כל endpoint הוא פונקציה אחת שקל להסביר.
השתמשנו ב-**Express 5** כי הוא מעביר שגיאות מפונקציות `async` אוטומטית ל-Error Handler.
ב-Express 4 שגיאה בתוך `async` (למשל Redis נפל) הייתה משאירה את הבקשה תלויה בלי תשובה.

## 2. Nginx כ-Reverse Proxy ל-API
הדפדפן פונה רק ל-`http://localhost:8080`. כל בקשה ל-`/api/*` מועברת ע"י Nginx ל-`http://api:3000`.
- **אין בעיית CORS** — הדף וה-API באותו Origin.
- **רק פורט אחד פתוח החוצה** — ה-API ו-Redis לא חשופים למחשב המארח.
- `api` הוא שם השירות ב-Compose — ה-DNS הפנימי של Docker מתרגם אותו לכתובת הקונטיינר.

## 3. Redis עם AOF + Named Volume
- `--appendonly yes` — כל פקודת כתיבה נרשמת לקובץ. בנפילה פתאומית נאבד לכל היותר שנייה (`appendfsync everysec`).
- `redis-data:/data` — Named Volume שמנוהל ע"י Docker ושורד `docker compose down`. רק `down -v` מוחק אותו.
- Named Volume ולא Bind Mount — בלי תלות בנתיבים/הרשאות במחשב של כל חבר צוות.

## 4. מבני נתונים ב-Redis
| Key | סוג | למה |
|---|---|---|
| `parking:active` | Sorted Set | ה-score הוא זמן הכניסה → מיון לפי זמן, `ZCARD` נותן תפוסה ב-O(1), אין כפילויות |
| `car:<plate>` | Hash | פרטי הרכב |
| `parking:history` | List | `LPUSH` + `LTRIM` = היסטוריה מוגבלת ל-50 רשומות |
| `stats:entries`, `stats:revenue` | String | מונים אטומיים (`INCR`, `INCRBYFLOAT`) |

כניסה/יציאה מתבצעות ב-`MULTI/EXEC` (טרנזקציה) — כל הפקודות קורות יחד.

## 5. התנהגות כש-Redis לא זמין
- `disableOfflineQueue: true` — בברירת מחדל node-redis שומר פקודות בתור עד שהחיבור חוזר, והבקשה נתקעת. אצלנו היא נכשלת מיד (503/500).
- node-redis מתחבר מחדש אוטומטית כש-Redis חוזר.
- `/api/health` בודק `db.isReady` + `PING` → ה-healthcheck של Docker יודע אם ה-API באמת עובד.

## 6. Healthchecks + `depends_on: condition: service_healthy`
`depends_on` רגיל מחכה רק שהקונטיינר **יתחיל**, לא שהוא **מוכן**. לכן:
`redis` (redis-cli ping) ← `api` (GET /api/health) ← `web`.

## 7. שתי רשתות
`frontend` (web↔api) ו-`backend` (api↔redis). ה-web לא יכול לגשת ישירות ל-Redis — Least Privilege.

## 8. Dockerfile של ה-API
- `COPY package*.json` ואז `npm ci` **לפני** `COPY server.js` → שכבת ההתקנה נשמרת ב-cache כל עוד התלויות לא השתנו.
- `npm ci` ולא `npm install` — מתקין בדיוק את הגרסאות מ-`package-lock.json` (build זהה בכל מקום).
- `--omit=dev` + `NODE_ENV=production` — image קטן יותר.
- `USER node` — לא רצים כ-root.
- `CMD ["node", "server.js"]` ולא `npm start` — כך node מקבל את ה-SIGTERM של `docker compose down` וסוגר יפה את החיבור ל-Redis.
- Healthcheck עם `wget` שכבר קיים ב-alpine.

## 9. Polling ולא WebSocket
לוח הבקרה שולח `fetch` כל 3 שניות. פשוט, עובד דרך כל Proxy, ומספיק לחניון.
אנימציית הכניסה מופעלת רק על רכבים חדשים — אחרת כל רענון היה "מהבהב" את כל הכרטיסים.

## 10. CI/CD
- **ci.yml** — Matrix בונה את 2 ה-Images במקביל עם cache של GitHub Actions; אחר כך בדיקת Compose מלאה שכוללת הוכחת persistence.
- **publish.yml** — `GITHUB_TOKEN` (נוצר אוטומטית לכל ריצה, אין סיסמה בקוד) + `permissions: packages: write`.
  `docker/metadata-action` מייצר תגיות וממיר לאותיות קטנות (ghcr.io דורש lowercase).
