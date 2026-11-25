// לוח הבקרה של Smart Parking
// פונה ל-API כל כמה שניות עם fetch() ובונה מחדש את הממשק (DOM דינמי) - בלי רענון של הדף.

const API = "/api";            // אותו מקור (origin) -> ה-Nginx מעביר את /api לקונטיינר ה-api
const POLL_MS = 3000;          // כל כמה מילישניות מושכים נתונים מחדש (3 שניות)

const $ = (id) => document.getElementById(id); // קיצור: $("x") במקום document.getElementById("x")
let knownPlates = null;        // מספרי הרישוי שראינו בבדיקה הקודמת (כדי לזהות רכבים חדשים)

// ---------- פונקציות עזר ----------
function formatMinutes(min) { // ממירה מספר דקות לטקסט קריא בעברית
  if (min < 60) return `${min} דק'`; // פחות משעה - מציגים רק דקות
  const h = Math.floor(min / 60); // מספר השעות השלמות
  return `${h} ש' ${min % 60} דק'`; // שעות + הדקות שנשארו
} // סוף formatMinutes

function formatTime(ts) { // ממירה זמן בשניות (timestamp) לשעה בפורמט ישראלי
  return new Date(ts * 1000).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }); // כופלים ב-1000 כי Date עובד במילישניות
} // סוף formatTime

function showToast(text, ms = 3000) { // מציגה הודעה קופצת (toast) למשך ms מילישניות
  const t = $("toast"); // אלמנט ההודעה
  t.textContent = text; // שמים בו את הטקסט
  t.classList.remove("hidden"); // מציגים אותו
  clearTimeout(showToast.timer); // מבטלים טיימר הסתרה קודם (אם הייתה הודעה לפני)
  showToast.timer = setTimeout(() => t.classList.add("hidden"), ms); // מסתירים אחרי ms; שומרים את הטיימר על הפונקציה עצמה
} // סוף showToast

async function api(path, options) { // עטיפה ל-fetch שפונה ל-API ומחזירה JSON
  const res = await fetch(API + path, options); // שולחים את הבקשה
  const body = await res.json().catch(() => ({})); // מפענחים JSON; אם אין גוף תקין - אובייקט ריק
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`); // אם הסטטוס אינו 2xx - זורקים שגיאה עם ההודעה מהשרת
  return body; // מחזירים את התוכן
} // סוף api

// ---------- ציור הממשק ----------
function renderStats(s) { // מעדכנת את כרטיסי הסטטיסטיקה ופס התפוסה
  $("s-occupied").textContent = `${s.occupied}/${s.capacity}`; // תפוסים מתוך הקיבולת
  $("s-free").textContent = s.free; // מקומות פנויים
  $("s-entries").textContent = s.total_entries; // סה"כ כניסות
  $("s-revenue").textContent = s.revenue.toFixed(0); // הכנסות בלי ספרות אחרי הנקודה

  const pct = Math.round((s.occupied / s.capacity) * 100); // אחוז התפוסה
  const bar = $("capacity-bar"); // פס התפוסה
  bar.style.width = pct + "%"; // רוחב הפס לפי האחוז
  bar.className = "capacity-bar " + (pct >= 100 ? "full" : pct >= 70 ? "warn" : "ok"); // צבע: אדום מלא, כתום מ-70%, ירוק אחרת

  $("full-alert").classList.toggle("hidden", !s.is_full); // מציגים את התראת "החניון מלא" רק כשהוא מלא

  const p = s.pricing; // פרטי התמחור מהשרת
  $("pricing").textContent = // כותבים את שורת התמחור:
    `תמחור: ${p.free_minutes} דק' ראשונות חינם · שעה ראשונה ₪${p.first_hour} · כל שעה נוספת ₪${p.extra_hour}`; // הטקסט עם הערכים מהשרת
} // סוף renderStats

function renderCars(cars) { // בונה מחדש את כרטיסי הרכבים שבחניון
  const box = $("cars"); // המיכל של הכרטיסים
  box.innerHTML = ""; // מרוקנים אותו

  if (cars.length === 0) { // אם אין רכבים
    box.innerHTML = `<p class="empty">החניון ריק 🌙</p>`; // מציגים הודעת "ריק"
  } // סוף בדיקת חניון ריק

  for (const car of cars) { // עוברים על כל רכב
    const card = document.createElement("div"); // יוצרים כרטיס חדש
    // מנפישים רק רכבים שזה עתה הגיעו (אחרת כל בדיקה הייתה מריצה את האנימציה מחדש)
    const isNew = knownPlates && !knownPlates.has(car.plate); // חדש = לא היה ברשימה הקודמת
    card.className = isNew ? "car new" : "car"; // מחלקת new מפעילה אנימציית כניסה
    // תוכן הכרטיס: לוחית רישוי, שעת כניסה + משך החניה, והמחיר הנוכחי לתשלום
    card.innerHTML = `
      <div class="plate">${car.plate}</div>
      <div class="meta">נכנס ב-${formatTime(car.entered_at)} · ${formatMinutes(car.minutes)}</div>
      <div class="price">לתשלום כרגע: ₪${car.price_now}</div>
    `;
    const btn = document.createElement("button"); // יוצרים כפתור שחרור
    btn.className = "exit-btn"; // מחלקת עיצוב (אדום)
    btn.textContent = "🚗 שחרור רכב"; // טקסט הכפתור
    btn.onclick = () => releaseCar(car.plate); // בלחיצה - משחררים את הרכב הזה
    card.appendChild(btn); // מוסיפים את הכפתור לכרטיס
    box.appendChild(card); // מוסיפים את הכרטיס למיכל
  } // סוף הלולאה

  // מזהים רכבים חדשים ומכריזים עליהם (סקריפטים אחרים יכולים להאזין לאירוע הזה)
  const plates = new Set(cars.map((c) => c.plate)); // סט של כל מספרי הרישוי הנוכחיים
  if (knownPlates) { // רק אם כבר הייתה בדיקה קודמת (בטעינה הראשונה לא מכריזים)
    for (const car of cars) { // עוברים על הרכבים
      if (!knownPlates.has(car.plate)) { // אם הרכב לא היה קודם
        document.dispatchEvent(new CustomEvent("car:arrived", { detail: car })); // שולחים אירוע "רכב הגיע" עם פרטיו
      } // סוף בדיקת רכב חדש
    } // סוף הלולאה
  } // סוף בדיקת knownPlates
  knownPlates = plates; // שומרים את הרשימה הנוכחית לבדיקה הבאה
} // סוף renderCars

function renderHistory(rows) { // בונה את טבלת היוצאים האחרונים
  $("history").innerHTML = rows // ממלאים את גוף הטבלה:
    .map((r) => `<tr><td>${r.plate}</td><td>${formatMinutes(r.minutes)}</td><td>₪${r.paid}</td><td>${formatTime(r.exited_at)}</td></tr>`) // שורה לכל רכב: רישוי, משך, שולם, שעת יציאה
    .join(""); // מחברים את כל השורות למחרוזת אחת
} // סוף renderHistory

// ---------- פעולות ----------
async function releaseCar(plate) { // משחררת רכב מהחניון
  try { // מנסים
    const r = await api(`/cars/${encodeURIComponent(plate)}/exit`, { method: "POST" }); // שולחים POST ליציאה (מקודדים את מספר הרישוי ל-URL)
    showToast(`רכב ${r.plate} יצא. לתשלום: ₪${r.paid}`); // מציגים כמה צריך לשלם
    document.dispatchEvent(new CustomEvent("car:left", { detail: r })); // שולחים אירוע "רכב יצא"
    refresh(); // מרעננים את הנתונים מיד
  } catch (e) { // אם נכשל
    showToast("שגיאה: " + e.message); // מציגים את השגיאה
  } // סוף try/catch
} // סוף releaseCar

$("manual-form").addEventListener("submit", async (e) => { // בשליחת טופס הכניסה הידנית (סימולציית מצלמה)
  e.preventDefault(); // מונעים רענון דף (ברירת המחדל של טופס)
  const plate = $("plate-input").value.trim(); // קוראים את מספר הרישוי ומורידים רווחים מהצדדים
  if (!plate) return; // שדה ריק - לא עושים כלום
  try { // מנסים
    await api("/cars", { // שולחים בקשה ל-API:
      method: "POST", // מסוג POST
      headers: { "Content-Type": "application/json" }, // מודיעים שהגוף הוא JSON
      body: JSON.stringify({ plate }), // הגוף: {"plate": "..."}
    }); // סוף הבקשה
    $("plate-input").value = ""; // מנקים את השדה
    refresh(); // מרעננים את הנתונים
  } catch (err) { // אם נכשל (לא תקין / כבר בפנים / מלא)
    showToast("לא נכנס: " + err.message); // מציגים את הסיבה
  } // סוף try/catch
}); // סוף מאזין הטופס

// ---------- לולאת הבדיקה (polling) ----------
async function refresh() { // מושכת את כל הנתונים ומעדכנת את המסך
  try { // מנסים
    const [stats, cars, history] = await Promise.all([api("/stats"), api("/cars"), api("/history")]); // 3 בקשות במקביל
    renderStats(stats); // מעדכנים סטטיסטיקות
    renderCars(cars); // מעדכנים כרטיסי רכבים
    renderHistory(history); // מעדכנים היסטוריה
    $("conn").textContent = "🟢 מחובר"; // מציגים סטטוס מחובר
    $("conn").className = "conn ok"; // צבע תקין
  } catch (e) { // אם ה-API לא עונה
    $("conn").textContent = "🔴 אין חיבור ל-API"; // מציגים סטטוס מנותק
    $("conn").className = "conn err"; // צבע אדום
  } // סוף try/catch
} // סוף refresh

refresh(); // טעינה ראשונה מיד כשהדף נפתח
setInterval(refresh, POLL_MS); // ואחר כך כל 3 שניות
