// ===== Our personal touch: "Galactic Parking" =====
// 1. Space mode (dark mode with stars) - saved in localStorage
// 2. Funny random message for every car that arrives / leaves
// 3. Easter egg: type 4 then 2 (anywhere outside the input) -> hyperspace jump 🚀

(function () {
  const btn = document.getElementById("theme-btn");
  const title = document.getElementById("title");

  // ---------- 1. space mode ----------
  function setSpace(on) {
    document.body.classList.toggle("space", on);
    btn.textContent = on ? "☀️ מצב רגיל" : "🌌 מצב חלל";
    title.textContent = on ? "🚀 Galactic Parking · חניון החלליות" : "🅿️ Smart Parking";
    try { localStorage.setItem("space-mode", on ? "1" : "0"); } catch (e) { /* storage blocked - ignore */ }
  }

  let saved = "0";
  try { saved = localStorage.getItem("space-mode") || "0"; } catch (e) { /* ignore */ }
  setSpace(saved === "1");
  btn.addEventListener("click", () => setSpace(!document.body.classList.contains("space")));

  // ---------- 2. funny messages ----------
  const arriveMsgs = [
    "🚀 החללית {p} נחתה בשלום. הוסטון, אין בעיה!",
    "🛸 {p} הגיע. החייזרים מבקשים לא לחנות על שני מקומות",
    "🌠 {p} נכנס במהירות האור (בתוך החניון: 10 קמ\"ש בבקשה)",
    "👽 ברוך הבא {p}! אל תשכח איפה חנית - הגלקסיה גדולה",
    "🪐 {p} בחניון. הקפה במכונה עולה 3 מטבעות גלקטיים",
  ];
  const leaveMsgs = [
    "👋 {p} המריא. שילם ₪{m} - חשבנו שתשאר לנצח",
    "🌌 {p} חזר לחלל העמוק. ₪{m} נגבו מהארנק הקוונטי",
    "🚀 3...2...1... {p} שוגר! עלות הדלק: ₪{m}",
  ];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  document.addEventListener("car:arrived", (e) => {
    showToast(pick(arriveMsgs).replace("{p}", e.detail.plate), 4000);
  });

  document.addEventListener("car:left", (e) => {
    // runs right after the default toast -> overrides it with a funny one
    showToast(pick(leaveMsgs).replace("{p}", e.detail.plate).replace("{m}", e.detail.paid), 4000);
  });

  // ---------- 3. easter egg: "42" ----------
  // "The Answer to the Ultimate Question of Life, the Universe, and Everything"
  let typed = "";
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return; // don't trigger while typing a plate
    typed = (typed + e.key).slice(-2);
    if (typed === "42") hyperspace();
  });

  function hyperspace() {
    const hs = document.getElementById("hyperspace");
    hs.classList.remove("hidden");
    document.body.classList.add("shake");
    showToast("🌀 קפיצה להיפר-חלל! התשובה לחיים, ליקום ולכל השאר: 42 ... והחניה עדיין בתשלום 😉", 5000);
    setTimeout(() => {
      hs.classList.add("hidden");
      document.body.classList.remove("shake");
    }, 2500);
  }
})();
