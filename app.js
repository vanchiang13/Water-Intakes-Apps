const STORAGE_KEY = "sip-water-tracker-v1";
const DEFAULT_SETTINGS = { goal: 2000, interval: 60, remindersEnabled: false, nextReminderAt: null };
const getTodayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) },
      days: saved.days && typeof saved.days === "object" ? saved.days : {}
    };
  } catch (error) {
    console.error("Could not read saved hydration data.", error);
    return { settings: { ...DEFAULT_SETTINGS }, days: {} };
  }
}

let state = readState();
let reminderTimer;
let toastTimer;
let today = getTodayKey();
const todayLabel = document.getElementById("today-label");
const consumedLabel = document.getElementById("consumed");
const goalLabel = document.getElementById("goal-label");
const progressFill = document.getElementById("progress-fill");
const progressBar = document.getElementById("progress-bar");
const progressMessage = document.getElementById("progress-message");
const glassWater = document.getElementById("glass-water");
const glassCaption = document.getElementById("glass-caption");
const historyList = document.getElementById("history-list");
const emptyState = document.getElementById("empty-state");
const sipCount = document.getElementById("sip-count");
const settingsDialog = document.getElementById("settings-dialog");
const customDialog = document.getElementById("custom-dialog");

function currentEntries() {
  const entries = state.days[today];
  return Array.isArray(entries) ? entries : [];
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Could not save hydration data.", error);
    showToast("Couldn't save your changes on this device.");
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2600);
}

function formatAmount(amount) {
  return new Intl.NumberFormat().format(amount);
}

function renderHistory(entries) {
  historyList.replaceChildren();
  emptyState.hidden = entries.length > 0;
  sipCount.textContent = `${entries.length} ${entries.length === 1 ? "drink" : "drinks"}`;
  [...entries].reverse().slice(0, 5).forEach(entry => {
    const row = document.createElement("div");
    row.className = "history-item";
    const main = document.createElement("div");
    main.className = "history-item-main";
    const icon = document.createElement("span");
    icon.className = "history-drop";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "↗";
    const details = document.createElement("div");
    const label = document.createElement("div");
    label.className = "history-label";
    label.textContent = entry.label;
    const time = document.createElement("div");
    time.className = "history-time";
    time.textContent = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(entry.at));
    details.append(label, time);
    main.append(icon, details);
    const amount = document.createElement("span");
    amount.className = "history-amount";
    amount.textContent = `+${formatAmount(entry.amount)} ml`;
    row.append(main, amount);
    historyList.append(row);
  });
}

function render() {
  const entries = currentEntries();
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const goal = state.settings.goal;
  const percent = Math.min(100, Math.round((total / goal) * 100));
  consumedLabel.textContent = formatAmount(total);
  goalLabel.textContent = formatAmount(goal);
  progressFill.style.width = `${percent}%`;
  progressBar.setAttribute("aria-valuemax", String(goal));
  progressBar.setAttribute("aria-valuenow", String(Math.min(total, goal)));
  progressMessage.textContent = total >= goal
    ? "You did it! Your body says thank you."
    : total === 0
      ? "Every sip is a fresh start."
      : `${formatAmount(Math.max(0, goal - total))} ml to your daily goal.`;
  const waterTop = 160 - (Math.min(total / goal, 1) * 115);
  glassWater.setAttribute("d", `M20 ${waterTop} Q45 ${waterTop - 8} 70 ${waterTop} T120 ${waterTop} V190 H20Z`);
  glassCaption.textContent = percent >= 100 ? "GOAL REACHED!" : percent > 0 ? `${percent}% OF YOUR GOAL` : "LET'S GET SIPPING";
  renderHistory(entries);
  renderReminder();
}

function addDrink(amount, label) {
  const entries = currentEntries();
  entries.push({ amount, label, at: new Date().toISOString() });
  state.days[today] = entries;
  if (state.settings.remindersEnabled) state.settings.nextReminderAt = Date.now() + state.settings.interval * 60_000;
  saveState();
  render();
  showToast(`${formatAmount(amount)} ml added. Nice going!`);
}

function renderReminder() {
  const enabled = state.settings.remindersEnabled;
  document.getElementById("reminder-title").textContent = enabled ? "Reminders are on" : "A little reminder?";
  document.getElementById("reminder-description").textContent = enabled
    ? `We'll nudge you every ${state.settings.interval} minutes to take a sip.`
    : "We'll give you a friendly nudge to take a sip.";
  document.getElementById("reminder-button-label").textContent = enabled ? "Turn off reminders" : "Turn on reminders";
  document.getElementById("reminder-note").textContent = enabled
    ? "Reminders work while this app is open."
    : "Reminders work while this app is open.";
}

function syncToday() {
  const current = getTodayKey();
  if (current === today) return;
  today = current;
  todayLabel.textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  render();
}

function scheduleReminders() {
  window.clearInterval(reminderTimer);
  if (!state.settings.remindersEnabled || !("Notification" in window) || Notification.permission !== "granted") return;
  if (!state.settings.nextReminderAt) {
    state.settings.nextReminderAt = Date.now() + state.settings.interval * 60_000;
    saveState();
  }
  reminderTimer = window.setInterval(() => {
    syncToday();
    if (!state.settings.remindersEnabled || Date.now() < state.settings.nextReminderAt) return;
    navigator.serviceWorker.ready.then(registration => registration.showNotification("Time for a little sip 💧", {
      body: "A few sips of water can be a lovely reset.",
      icon: "/icon.svg",
      tag: "sip-water-reminder"
    })).catch(error => console.error("Could not display reminder.", error));
    state.settings.nextReminderAt = Date.now() + state.settings.interval * 60_000;
    saveState();
  }, 15_000);
}

async function toggleReminders() {
  if (state.settings.remindersEnabled) {
    state.settings.remindersEnabled = false;
    state.settings.nextReminderAt = null;
    saveState();
    render();
    window.setInterval(syncToday, 60_000);
    document.addEventListener("visibilitychange", syncToday);
    scheduleReminders();
    showToast("Reminders turned off.");
    return;
  }
  if (!("Notification" in window)) {
    showToast("This browser doesn't support notifications.");
    return;
  }
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    showToast("Open Sip on localhost or HTTPS to enable notifications.");
    return;
  }
  const permission = Notification.permission === "default"
    ? await Notification.requestPermission()
    : Notification.permission;
  if (permission !== "granted") {
    showToast(permission === "denied" ? "Allow notifications in your browser settings first." : "Notification permission wasn't granted.");
    return;
  }
  state.settings.remindersEnabled = true;
  state.settings.nextReminderAt = Date.now() + state.settings.interval * 60_000;
  saveState();
  render();
  scheduleReminders();
  showToast("Reminders are on. Stay sip-happy!");
}

function openSettings() {
  document.getElementById("goal-input").value = state.settings.goal;
  document.getElementById("interval-input").value = String(state.settings.interval);
  settingsDialog.showModal();
}

document.querySelectorAll(".drink-button").forEach(button => {
  button.addEventListener("click", () => {
    const amount = Number(button.dataset.amount);
    const label = button.querySelector(".drink-label").textContent;
    addDrink(amount, label);
  });
});

document.getElementById("custom-button").addEventListener("click", () => {
  document.getElementById("custom-amount").value = "";
  customDialog.showModal();
});
document.getElementById("custom-form").addEventListener("submit", event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const amount = Number(form.get("amount"));
  if (!Number.isInteger(amount) || amount < 1 || amount > 5000) {
    showToast("Enter an amount between 1 and 5,000 ml.");
    return;
  }
  addDrink(amount, "Custom drink");
  customDialog.close();
});
document.getElementById("settings-button").addEventListener("click", openSettings);
document.getElementById("reminder-button").addEventListener("click", toggleReminders);
document.getElementById("settings-form").addEventListener("submit", event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const goal = Number(form.get("goal"));
  const interval = Number(form.get("interval"));
  if (!Number.isInteger(goal) || goal < 250 || goal > 10000) {
    showToast("Set a daily goal between 250 and 10,000 ml.");
    return;
  }
  state.settings.goal = goal;
  state.settings.interval = interval;
  if (state.settings.remindersEnabled) state.settings.nextReminderAt = Date.now() + interval * 60_000;
  saveState();
  settingsDialog.close();
  render();
  scheduleReminders();
  showToast("Your daily rhythm has been updated.");
});

todayLabel.textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date());
render();
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("/sw.js").catch(error => console.error("Could not register service worker.", error));
}
scheduleReminders();
