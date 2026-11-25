// ===== הנגיעה האישית שלנו: "Galactic Parking" =====
// 1. מצב חלל (מצב כהה עם כוכבים) - נשמר ב-localStorage
// 2. הודעה מצחיקה אקראית לכל רכב שנכנס / יוצא
// 3. ביצת פסחא: מקלידים 4 ואז 2 (בכל מקום מחוץ לשדה הקלט) -> קפיצה להיפר-חלל 🚀

(function () { // פונקציה שמריצה את עצמה - המשתנים בפנים לא "דולפים" לסקופ הגלובלי
  const btn = document.getElementById("theme-btn"); // כפתור החלפת המצב
  const title = document.getElementById("title"); // כותרת הדף

  // ---------- 1. מצב חלל ----------
  function setSpace(on) { // מפעילה (true) או מכבה (false) את מצב החלל
    document.body.classList.toggle("space", on); // מוסיפה/מסירה את המחלקה space מה-body
    btn.textContent = on ? "☀️ מצב רגיל" : "🌌 מצב חלל"; // טקסט הכפתור לפי המצב
    title.textContent = on ? "🚀 Galactic Parking · חניון החלליות" : "🅿️ Smart Parking"; // הכותרת לפי המצב
    try { localStorage.setItem("space-mode", on ? "1" : "0"); } catch (e) { /* האחסון חסום - מתעלמים */ } // שומרים את הבחירה בדפדפן
  } // סוף setSpace

  let saved = "0"; // ברירת מחדל: מצב רגיל
  try { saved = localStorage.getItem("space-mode") || "0"; } catch (e) { /* מתעלמים */ } // קוראים את הבחירה השמורה
  setSpace(saved === "1"); // מפעילים את המצב השמור
  btn.addEventListener("click", () => setSpace(!document.body.classList.contains("space"))); // בלחיצה - הופכים את המצב

  // ---------- 2. הודעות מצחיקות ----------
  const arriveMsgs = [ // הודעות לרכב שנכנס ({p} יוחלף במספר הרישוי)
    "🚀 החללית {p} נחתה בשלום. הוסטון, אין בעיה!", // הודעה 1
    "🛸 {p} הגיע. החייזרים מבקשים לא לחנות על שני מקומות", // הודעה 2
    "🌠 {p} נכנס במהירות האור (בתוך החניון: 10 קמ\"ש בבקשה)", // הודעה 3
    "👽 ברוך הבא {p}! אל תשכח איפה חנית - הגלקסיה גדולה", // הודעה 4
    "🪐 {p} בחניון. הקפה במכונה עולה 3 מטבעות גלקטיים", // הודעה 5
  ]; // סוף הודעות הכניסה
  const leaveMsgs = [ // הודעות לרכב שיוצא ({m} יוחלף בסכום)
    "👋 {p} המריא. שילם ₪{m} - חשבנו שתשאר לנצח", // הודעה 1
    "🌌 {p} חזר לחלל העמוק. ₪{m} נגבו מהארנק הקוונטי", // הודעה 2
    "🚀 3...2...1... {p} שוגר! עלות הדלק: ₪{m}", // הודעה 3
  ]; // סוף הודעות היציאה
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]; // בוחרת איבר אקראי מהמערך

  document.addEventListener("car:arrived", (e) => { // מאזינים לאירוע "רכב הגיע" שנשלח מ-app.js
    showToast(pick(arriveMsgs).replace("{p}", e.detail.plate), 4000); // מציגים הודעה אקראית עם מספר הרישוי ל-4 שניות
  }); // סוף מאזין הכניסה

  document.addEventListener("car:left", (e) => { // מאזינים לאירוע "רכב יצא"
    // רץ מיד אחרי ההודעה הרגילה -> מחליף אותה בהודעה מצחיקה
    showToast(pick(leaveMsgs).replace("{p}", e.detail.plate).replace("{m}", e.detail.paid), 4000); // מחליפים מספר רישוי וסכום
  }); // סוף מאזין היציאה

  // ---------- 3. ביצת פסחא: "42" ----------
  // "התשובה לשאלה האולטימטיבית של החיים, היקום וכל השאר" (מדריך הטרמפיסט לגלקסיה)
  let typed = ""; // שתי ההקשות האחרונות
  document.addEventListener("keydown", (e) => { // מאזינים לכל הקשה במקלדת
    if (e.target.tagName === "INPUT") return; // לא מפעילים בזמן הקלדת מספר רישוי בשדה
    typed = (typed + e.key).slice(-2); // מוסיפים את המקש ושומרים רק את 2 התווים האחרונים
    if (typed === "42") hyperspace(); // אם הוקלד 42 - קופצים להיפר-חלל
  }); // סוף מאזין המקלדת

  function hyperspace() { // אפקט הקפיצה להיפר-חלל
    const hs = document.getElementById("hyperspace"); // שכבת האנימציה
    hs.classList.remove("hidden"); // מציגים אותה (האנימציה מתחילה)
    document.body.classList.add("shake"); // מרעידים את כל הדף
    showToast("🌀 קפיצה להיפר-חלל! התשובה לחיים, ליקום ולכל השאר: 42 ... והחניה עדיין בתשלום 😉", 5000); // הודעה ל-5 שניות
    setTimeout(() => { // אחרי 2.5 שניות (אורך האנימציה):
      hs.classList.add("hidden"); // מסתירים את השכבה
      document.body.classList.remove("shake"); // מפסיקים את הרעידה
    }, 2500); // 2500 מילישניות
  } // סוף hyperspace
})(); // סוף הפונקציה והרצתה המיידית
