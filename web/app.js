// Smart Parking dashboard
// Polls the API every few seconds with fetch() and rebuilds the UI (dynamic DOM) - no page refresh.

const API = "/api";            // same origin -> Nginx forwards /api to the api container
const POLL_MS = 3000;

const $ = (id) => document.getElementById(id);
let knownPlates = null;        // plates we saw on the previous poll (to detect new arrivals)

// ---------- helpers ----------
function formatMinutes(min) {
  if (min < 60) return `${min} דק'`;
  const h = Math.floor(min / 60);
  return `${h} ש' ${min % 60} דק'`;
}

function formatTime(ts) {
  return new Date(ts * 1000).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function showToast(text, ms = 3000) {
  const t = $("toast");
  t.textContent = text;
  t.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.classList.add("hidden"), ms);
}

async function api(path, options) {
  const res = await fetch(API + path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

// ---------- rendering ----------
function renderStats(s) {
  $("s-occupied").textContent = `${s.occupied}/${s.capacity}`;
  $("s-free").textContent = s.free;
  $("s-entries").textContent = s.total_entries;
  $("s-revenue").textContent = s.revenue.toFixed(0);

  const pct = Math.round((s.occupied / s.capacity) * 100);
  const bar = $("capacity-bar");
  bar.style.width = pct + "%";
  bar.className = "capacity-bar " + (pct >= 100 ? "full" : pct >= 70 ? "warn" : "ok");

  $("full-alert").classList.toggle("hidden", !s.is_full);

  const p = s.pricing;
  $("pricing").textContent =
    `תמחור: ${p.free_minutes} דק' ראשונות חינם · שעה ראשונה ₪${p.first_hour} · כל שעה נוספת ₪${p.extra_hour}`;
}

function renderCars(cars) {
  const box = $("cars");
  box.innerHTML = "";

  if (cars.length === 0) {
    box.innerHTML = `<p class="empty">החניון ריק 🌙</p>`;
  }

  for (const car of cars) {
    const card = document.createElement("div");
    // animate only cars that just arrived (otherwise every poll would replay the animation)
    const isNew = knownPlates && !knownPlates.has(car.plate);
    card.className = isNew ? "car new" : "car";
    card.innerHTML = `
      <div class="plate">${car.plate}</div>
      <div class="meta">נכנס ב-${formatTime(car.entered_at)} · ${formatMinutes(car.minutes)}</div>
      <div class="price">לתשלום כרגע: ₪${car.price_now}</div>
    `;
    const btn = document.createElement("button");
    btn.className = "exit-btn";
    btn.textContent = "🚗 שחרור רכב";
    btn.onclick = () => releaseCar(car.plate);
    card.appendChild(btn);
    box.appendChild(card);
  }

  // detect new arrivals and announce them (other scripts can listen to this event)
  const plates = new Set(cars.map((c) => c.plate));
  if (knownPlates) {
    for (const car of cars) {
      if (!knownPlates.has(car.plate)) {
        document.dispatchEvent(new CustomEvent("car:arrived", { detail: car }));
      }
    }
  }
  knownPlates = plates;
}

function renderHistory(rows) {
  $("history").innerHTML = rows
    .map((r) => `<tr><td>${r.plate}</td><td>${formatMinutes(r.minutes)}</td><td>₪${r.paid}</td><td>${formatTime(r.exited_at)}</td></tr>`)
    .join("");
}

// ---------- actions ----------
async function releaseCar(plate) {
  try {
    const r = await api(`/cars/${encodeURIComponent(plate)}/exit`, { method: "POST" });
    showToast(`רכב ${r.plate} יצא. לתשלום: ₪${r.paid}`);
    document.dispatchEvent(new CustomEvent("car:left", { detail: r }));
    refresh();
  } catch (e) {
    showToast("שגיאה: " + e.message);
  }
}

$("manual-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const plate = $("plate-input").value.trim();
  if (!plate) return;
  try {
    await api("/cars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plate }),
    });
    $("plate-input").value = "";
    refresh();
  } catch (err) {
    showToast("לא נכנס: " + err.message);
  }
});

// ---------- polling loop ----------
async function refresh() {
  try {
    const [stats, cars, history] = await Promise.all([api("/stats"), api("/cars"), api("/history")]);
    renderStats(stats);
    renderCars(cars);
    renderHistory(history);
    $("conn").textContent = "🟢 מחובר";
    $("conn").className = "conn ok";
  } catch (e) {
    $("conn").textContent = "🔴 אין חיבור ל-API";
    $("conn").className = "conn err";
  }
}

refresh();
setInterval(refresh, POLL_MS);
