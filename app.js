const STORAGE_KEY = "marketpulse-in.snapshot.v2";
const INSTALL_MESSAGE = "Open the hosted URL in Safari on iPhone, then use Share -> Add to Home Screen.";
const API_ENDPOINTS = [
  "./api/market-data",
  "/api/market-data",
  "./data/latest.json",
  "/data/latest.json"
];

const elements = {
  refreshButton: document.getElementById("refreshButton"),
  statusPill: document.getElementById("statusPill"),
  lastUpdatedLabel: document.getElementById("lastUpdatedLabel"),
  tBillRates: document.getElementById("tBillRates"),
  cpPrimary: document.getElementById("cpPrimary"),
  cdPrimary: document.getElementById("cdPrimary"),
  ncdPrimary: document.getElementById("ncdPrimary"),
  installMessage: document.getElementById("installMessage"),
  errorPanel: document.getElementById("errorPanel"),
  errorList: document.getElementById("errorList")
};

document.addEventListener("DOMContentLoaded", async () => {
  elements.installMessage.textContent = INSTALL_MESSAGE;
  hydrateFromCache();
  registerServiceWorker();
  elements.refreshButton.addEventListener("click", () => refreshDashboard());
  await refreshDashboard({ initialLoad: true });
});

function hydrateFromCache() {
  const cached = readCache();
  if (!cached) {
    renderEmpty();
    return;
  }

  renderSnapshot(cached, {
    statusText: "Showing cached snapshot",
    state: "warn",
    errors: cached.errors || []
  });
}

function readCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Unable to read cache", error);
    return null;
  }
}

function saveCache(snapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn("Unable to save cache", error);
  }
}

async function refreshDashboard({ initialLoad = false } = {}) {
  setLoading(true, initialLoad ? "Syncing initial snapshot" : "Refreshing live data");

  const apiSnapshot = await fetchApiSnapshot();
  if (apiSnapshot) {
    const normalized = normalizeSnapshot(apiSnapshot, []);
    saveCache(normalized);
    renderSnapshot(normalized, {
      statusText: "Live snapshot ready",
      state: "ok",
      errors: normalized.errors
    });
    setLoading(false);
    return;
  }

  const cached = readCache();
  if (cached) {
    renderSnapshot(cached, {
      statusText: "Live fetch failed, showing cached snapshot",
      state: "error",
      errors: ["Backend snapshot unavailable."]
    });
  } else {
    renderEmpty();
    renderErrors(["Backend snapshot unavailable."]);
  }

  setLoading(false);
}

async function fetchApiSnapshot() {
  for (const endpoint of API_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) {
        continue;
      }

      const json = await response.json();
      if (!json || typeof json !== "object") {
        continue;
      }

      if (Array.isArray(json.tBills) || Array.isArray(json.cpPrimary) || Array.isArray(json.cdPrimary) || Array.isArray(json.ncdPrimary)) {
        return json;
      }
    } catch (error) {
      console.warn(`API snapshot fetch failed for ${endpoint}`, error);
    }
  }

  return null;
}

function normalizeSnapshot(snapshot, extraErrors) {
  return {
    fetchedAt: snapshot.fetchedAt || new Date().toISOString(),
    tBills: Array.isArray(snapshot.tBills) ? snapshot.tBills : [],
    cpPrimary: Array.isArray(snapshot.cpPrimary) ? snapshot.cpPrimary : [],
    cdPrimary: Array.isArray(snapshot.cdPrimary) ? snapshot.cdPrimary : [],
    ncdPrimary: Array.isArray(snapshot.ncdPrimary) ? snapshot.ncdPrimary : [],
    errors: [...(Array.isArray(snapshot.errors) ? snapshot.errors : []), ...extraErrors]
  };
}

function renderSnapshot(snapshot, { statusText, state, errors }) {
  renderStatus(statusText, state, snapshot.fetchedAt);
  renderTBills(snapshot.tBills);
  renderPrimaryList(elements.cpPrimary, snapshot.cpPrimary, "No CP primary issuances captured in the latest snapshot.");
  renderPrimaryList(elements.cdPrimary, snapshot.cdPrimary, "No CD primary issuances captured in the latest snapshot.");
  renderPrimaryList(elements.ncdPrimary, snapshot.ncdPrimary, "No NCD primary issuances captured in the latest snapshot.");
  renderErrors(errors || []);
}

function renderEmpty() {
  elements.tBillRates.innerHTML = `<div class="empty-state">T-bill rates will appear here.</div>`;
  elements.cpPrimary.innerHTML = `<div class="empty-state">CP primary issuances will appear here.</div>`;
  elements.cdPrimary.innerHTML = `<div class="empty-state">CD primary issuances will appear here.</div>`;
  elements.ncdPrimary.innerHTML = `<div class="empty-state">NCD primary issuances will appear here.</div>`;
}

function renderStatus(text, state, fetchedAt) {
  elements.statusPill.textContent = text;
  elements.statusPill.dataset.state = state;
  elements.lastUpdatedLabel.textContent = fetchedAt
    ? `Last snapshot: ${new Date(fetchedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`
    : "No snapshot timestamp available";
}

function renderTBills(rows) {
  if (!rows.length) {
    elements.tBillRates.innerHTML = `<div class="empty-state">No T-bill rates parsed from the latest snapshot.</div>`;
    return;
  }

  elements.tBillRates.innerHTML = rows.map((row) => `
    <div class="metric-card">
      <span class="metric-card__label">${escapeHtml(row.instrument)}</span>
      <span class="metric-card__value">${escapeHtml(row.yield)}%</span>
      <span class="metric-card__meta">RBI cut-off yield | Auction tenor ${escapeHtml(row.tenor)} days | Source date ${escapeHtml(row.asOn || "Latest available")}</span>
    </div>
  `).join("");
}

function renderPrimaryList(target, rows, emptyMessage) {
  if (!rows.length) {
    target.innerHTML = `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  target.innerHTML = rows.map((row) => `
    <article class="feed-item">
      <div class="feed-item__title">${escapeHtml(row.issuer)}</div>
      <span class="feed-item__meta">${escapeHtml(row.description)} | Maturity ${escapeHtml(row.maturityDate)} | Amount Rs ${escapeHtml(row.issueAmount)} cr | Yield ${escapeHtml(row.yieldFrom)}%${row.yieldTo && row.yieldTo !== row.yieldFrom ? ` to ${escapeHtml(row.yieldTo)}%` : ""}</span>
    </article>
  `).join("");
}

function renderErrors(errors) {
  if (!errors.length) {
    elements.errorPanel.classList.add("hidden");
    elements.errorList.innerHTML = "";
    return;
  }

  elements.errorPanel.classList.remove("hidden");
  elements.errorList.innerHTML = errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("");
}

function setLoading(isLoading, text = "Loading") {
  elements.refreshButton.disabled = isLoading;
  if (isLoading) {
    elements.statusPill.textContent = text;
    elements.statusPill.dataset.state = "warn";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.warn("Service worker registration failed", error);
  });
}
