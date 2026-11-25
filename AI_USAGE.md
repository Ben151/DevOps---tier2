# תיעוד שימוש ב-AI

השתמשנו ב-Claude כעוזר לכתיבת קוד ולהסברים. כל קובץ נקרא, הורץ והובן ע"י הצוות לפני שנכנס לריפו.

## פרומפטים עיקריים

| # | שלב | פרומפט (מקוצר) |
|---|---|---|
| 1 | תכנון | "קיבלנו מטלת Docker Compose — חניון חכם, Track 2 (Nginx + Redis + API). רוצים הכל ב-JavaScript. תציע מבנה תיקיות וחלוקה לקומיטים" |
| 2 | API | "תכתוב שרת Node.js + Express עם Redis: POST לכניסת רכב, GET לרשימה, שחרור רכב עם חישוב מחיר לפי שעות. איזה מבנה נתונים ב-Redis מתאים ולמה?" |
| 3 | Dockerfile | "Dockerfile ל-Node עם npm ci, משתמש לא root ו-healthcheck. תסביר כל שורה" |
| 4 | Frontend | "לוח בקרה ב-HTML/CSS/JS בעברית שמושך נתונים מה-API כל 3 שניות עם fetch ובונה כרטיסים דינמית" |
| 5 | Nginx | "איך Nginx מגיש קבצים סטטיים ומעביר /api לקונטיינר אחר? למה זה עדיף על CORS?" |
| 6 | Compose | "docker-compose עם redis ששומר לקובץ, volume, healthchecks ו-depends_on" |
| 7 | אישי | "רעיונות לטאץ' אישי בנושא חלל: dark mode, הודעות מצחיקות, easter egg" |
| 8 | CI | "GitHub Actions שבונה את ה-images בכל push ובודק שהנתונים שורדים down/up" |
| 9 | בונוס | "workflow שדוחף ל-ghcr.io עם GITHUB_TOKEN ותיוג גרסאות אוטומטי" |

## טעויות של ה-AI ואיך תיקנו

### 1. Express 4 + פונקציות `async` — בקשות שנתקעות
**מה ה-AI נתן:** Express 4 עם `app.post("/api/cars", async (req, res) => {...})` ו-Error Handler בסוף.
**הבעיה:** ב-Express 4 שגיאה בתוך פונקציה `async` לא מגיעה ל-Error Handler. כשכיבינו את Redis הבקשה נשארה תלויה בלי תשובה.
**התיקון:** שדרוג ל-Express 5, שתופס שגיאות מ-`async` אוטומטית.

### 2. בקשות נתקעות כש-Redis למטה
**מה גילינו:** גם אחרי התיקון, כשעצרנו את Redis, `curl /api/health` לא חזר בכלל.
**הסיבה:** node-redis שומר פקודות בתור (offline queue) עד שהחיבור חוזר.
**התיקון:** `createClient({ ..., disableOfflineQueue: true })` ובדיקת `db.isReady` ב-health. עכשיו מתקבל 503 מיד.

### 3. JSON שבור החזיר 500 במקום 400
**הבעיה:** body לא תקין (`{bad`) הגיע ל-Error Handler הכללי והחזיר "internal server error".
**התיקון:** בדיקת `err.type === "entity.parse.failed"` והחזרת 400.

### 4. הכרטיסים בלוח הבקרה "מהבהבים"
**מה ה-AI נתן:** אנימציית `slide-in` על כל כרטיס `.car`.
**הבעיה:** כל 3 שניות הכרטיסים נבנים מחדש → האנימציה מתחילה שוב מ-`opacity: 0`, ובצילום מסך הכרטיסים נראו כאילו נעלמו.
**התיקון:** class בשם `new` רק לרכבים שלא היו ברענון הקודם, והאנימציה רק עליו.

### 5. שם Image עם אותיות גדולות ב-GHCR
**מה ה-AI נתן:** `tags: ghcr.io/${{ github.repository }}:latest`.
**הבעיה:** אם בשם המשתמש יש אותיות גדולות, ghcr.io דוחה (`invalid reference format`).
**התיקון:** `docker/metadata-action` שממיר ל-lowercase ומייצר גם את התגיות.

## מה למדנו
- AI נותן קוד שנראה נכון אבל לא תמיד מכיר התנהגויות של ספריות (Express 4, node-redis).
- חובה להריץ ולבדוק מקרי קצה — כמו לכבות את Redis באמצע — רוב הטעויות התגלו רק כך.
