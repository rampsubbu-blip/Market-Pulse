const STORAGE_KEY = "marketpulse-in.snapshot.v1";
const INSTALL_MESSAGE = "On iPhone, Safari does not show an install prompt. Use Share -> Add to Home Screen.";
const FEED_LIMIT = 6;
const API_ENDPOINTS = [
  "./data/latest.json",
  "/data/latest.json",
  "./api/market-data",
  "/api/market-data"
];

const SOURCES = {
  rbiFeed: "https://rbi.org.in/pressreleases_rss.xml",
  ccilMoneyMarket: "https://www.ccilindia.com/money-market-rates-and-volumes-most-liquid-tenor-",
  fimmda: "https://www.fimmda.org/NSE.aspx"
};

const elements = {
  refreshButton: document.getElementById("refreshButton"),
  statusPill: document.getElementById("statusPill"),
  lastUpdatedLabel: document.getElementById("lastUpdatedLabel"),
  outlook: document.getElementById("outlook"),
  ccilMetrics: document.getElementById("ccilMetrics"),
  fimmdaMetrics: document.getElementById("fimmdaMetrics"),
  rbiFeed: document.getElementById("rbiFeed"),
  installMessage: document.getElementById("installMessage"),
  errorPanel: document.getElementById("errorPanel"),
  errorList: document.getElementById("errorList")
};

let deferredInstallPrompt = null;

document.addEventListener("DOMContentLoaded", async () => {
  elements.installMessage.textContent = INSTALL_MESSAGE;
  hydrateFromCache();
  registerServiceWorker();
  wireInstallPrompt();
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

  const results = await Promise.allSettled([
    fetchSource("RBI feed", SOURCES.rbiFeed, parseRbiFeed),
    fetchSource("CCIL money market", SOURCES.ccilMoneyMarket, parseCcilPage),
    fetchSource("FIMMDA benchmarks", SOURCES.fimmda, parseFimmdaPage)
  ]);

  const snapshot = {
    fetchedAt: new Date().toISOString(),
    rbi: extractFulfilled(results[0], []),
    ccil: extractFulfilled(results[1], []),
    fimmda: extractFulfilled(results[2], []),
    errors: results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason?.message || "Unknown fetch error")
  };

  const successfulSources = [snapshot.rbi.length, snapshot.ccil.length, snapshot.fimmda.length].filter(Boolean).length;

  if (successfulSources === 0) {
    const cached = readCache();
    if (cached) {
      renderSnapshot(cached, {
        statusText: "Live fetch failed, showing cached snapshot",
        state: "error",
        errors: snapshot.errors
      });
      setLoading(false);
      return;
    }
  }

  saveCache(snapshot);
  renderSnapshot(snapshot, {
    statusText: successfulSources === 3 ? "Live snapshot ready" : "Partial live snapshot ready",
    state: successfulSources === 3 ? "ok" : "warn",
    errors: snapshot.errors
  });
  setLoading(false);
}

function extractFulfilled(result, fallback) {
  return result.status === "fulfilled" ? result.value : fallback;
}

async function fetchSource(label, url, parser) {
  const attempts = buildAttempts(url);
  let lastError = null;

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, {
        headers: attempt.headers,
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`${label} returned ${response.status}`);
      }

      const text = await response.text();
      const parsed = parser(text);
      if (!parsed || !parsed.length) {
        throw new Error(`${label} returned no usable rows`);
      }
      return parsed;
    } catch (error) {
      lastError = new Error(`${label} failed via ${attempt.name}: ${error.message}`);
    }
  }

  throw lastError || new Error(`${label} failed`);
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

      if (Array.isArray(json.rbi) || Array.isArray(json.ccil) || Array.isArray(json.fimmda)) {
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
    rbi: Array.isArray(snapshot.rbi) ? snapshot.rbi : [],
    ccil: Array.isArray(snapshot.ccil) ? snapshot.ccil : [],
    fimmda: Array.isArray(snapshot.fimmda) ? snapshot.fimmda : [],
    errors: [...(Array.isArray(snapshot.errors) ? snapshot.errors : []), ...extraErrors]
  };
}

function buildAttempts(url) {
  const cleanUrl = url.replace(/^https?:\/\//, "");
  return [
    { name: "direct", url },
    { name: "allorigins", url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
    { name: "cors.isomorphic-git", url: `https://cors.isomorphic-git.org/${url}` },
    { name: "jina-mirror", url: `https://r.jina.ai/http://${cleanUrl}` }
  ];
}

function parseRbiFeed(text) {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  const items = Array.from(doc.querySelectorAll("item"))
    .map((item) => ({
      title: item.querySelector("title")?.textContent?.trim(),
      link: item.querySelector("link")?.textContent?.trim(),
      pubDate: item.querySelector("pubDate")?.textContent?.trim(),
      description: stripHtml(item.querySelector("description")?.textContent || "")
    }))
    .filter((item) => item.title && item.link);

  const priority = items.filter((item) => /liquidity|auction|treasury bill|t-bill|repo|standing deposit|msf|ways and means/i.test(item.title));
  return (priority.length ? priority : items).slice(0, FEED_LIMIT);
}

function parseCcilPage(text) {
  const normalized = normalizeWhitespace(text);
  const pattern = /(\d{2}-\d{2}-\d{4})\s+(Call|TREP|Basket Repo|Special Repo)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/gi;
  const rows = [];
  let match;

  while ((match = pattern.exec(normalized)) !== null) {
    rows.push({
      date: match[1],
      instrument: match[2],
      open: match[3],
      high: match[4],
      low: match[5],
      wavg: match[6],
      volume: match[7],
      trades: match[8]
    });
  }

  return dedupeByLabel(rows, (row) => row.instrument).slice(0, 6);
}

function parseFimmdaPage(text) {
  const normalized = normalizeWhitespace(text);
  const pattern = /(Overnight|3 Day|14 Day|1 Month|3 Month|6 Month|1 Year)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/gi;
  const rows = [];
  let match;

  while ((match = pattern.exec(normalized)) !== null) {
    rows.push({
      tenor: match[1],
      mibid: match[2],
      mibor: match[3],
      previous: match[4],
      change: match[5]
    });
  }

  return dedupeByLabel(rows, (row) => row.tenor).slice(0, 6);
}

function dedupeByLabel(items, getKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function renderSnapshot(snapshot, { statusText, state, errors }) {
  renderStatus(statusText, state, snapshot.fetchedAt);
  renderOutlook(snapshot);
  renderCcil(snapshot.ccil);
  renderFimmda(snapshot.fimmda);
  renderRbi(snapshot.rbi);
  renderErrors(errors || []);
}

function renderEmpty() {
  elements.outlook.innerHTML = `<div class="empty-state">No cached data yet. Tap Refresh Data after hosting the app over https, or publish a JSON snapshot in <code>data/latest.json</code>.</div>`;
  elements.ccilMetrics.innerHTML = `<div class="empty-state">CCIL metrics will appear here.</div>`;
  elements.fimmdaMetrics.innerHTML = `<div class="empty-state">FIMMDA benchmarks will appear here.</div>`;
  elements.rbiFeed.innerHTML = `<div class="empty-state">RBI headlines will appear here.</div>`;
}

function renderStatus(text, state, fetchedAt) {
  elements.statusPill.textContent = text;
  elements.statusPill.dataset.state = state;
  elements.lastUpdatedLabel.textContent = fetchedAt
    ? `Last snapshot: ${new Date(fetchedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`
    : "No snapshot timestamp available";
}

function renderOutlook(snapshot) {
  const cards = buildOutlookCards(snapshot)
    .map((item) => `
      <div class="outlook-card">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.body)}</span>
      </div>
    `)
    .join("");

  elements.outlook.innerHTML = cards || `<div class="empty-state">No insights yet. Refresh after the sources are reachable.</div>`;
}

function buildOutlookCards(snapshot) {
  const cards = [];
  const call = findCcil(snapshot.ccil, "Call");
  const trep = findCcil(snapshot.ccil, "TREP");
  const overnight = findFimmda(snapshot.fimmda, "Overnight");
  const topHeadline = snapshot.rbi[0];

  if (call && trep) {
    const callRate = Number(call.wavg);
    const trepRate = Number(trep.wavg);

    if (Number.isFinite(callRate) && Number.isFinite(trepRate)) {
      if (callRate - trepRate > 0.2) {
        cards.push({
          title: "Funding tone looks tighter",
          body: `Call money is trading above TREP by ${(callRate - trepRate).toFixed(2)} percentage points, which usually points to tighter unsecured liquidity versus collateralized funding.`
        });
      } else {
        cards.push({
          title: "Front-end liquidity looks balanced",
          body: `Call and TREP weighted averages are moving in a tight band, suggesting overnight funding conditions are relatively orderly.`
        });
      }
    }
  }

  if (overnight) {
    cards.push({
      title: "Benchmark checkpoint",
      body: `FIMMDA Overnight MIBOR is ${overnight.mibor}, with previous close at ${overnight.previous}. Use this as a quick sense-check against your CCIL front-end read.`
    });
  }

  if (topHeadline) {
    cards.push({
      title: "RBI watch item",
      body: `${topHeadline.title}. Keep that release on the radar before taking your first liquidity or short-end view for the day.`
    });
  }

  if (!cards.length) {
    cards.push({
      title: "Snapshot pending",
      body: "This app is ready, but it still needs one successful fetch after deployment to populate the daily read."
    });
  }

  return cards.slice(0, 3);
}

function renderCcil(rows) {
  if (!rows.length) {
    elements.ccilMetrics.innerHTML = `<div class="empty-state">No CCIL rows parsed from the latest fetch.</div>`;
    return;
  }

  elements.ccilMetrics.innerHTML = rows.map((row) => `
    <div class="metric-card">
      <span class="metric-card__label">${escapeHtml(row.instrument)}</span>
      <span class="metric-card__value">${escapeHtml(row.wavg)}%</span>
      <span class="metric-card__meta">Date ${escapeHtml(row.date)} • Volume ${escapeHtml(row.volume)} • Trades ${escapeHtml(row.trades)}</span>
    </div>
  `).join("");
}

function renderFimmda(rows) {
  if (!rows.length) {
    elements.fimmdaMetrics.innerHTML = `<div class="empty-state">No FIMMDA rows parsed from the latest fetch.</div>`;
    return;
  }

  elements.fimmdaMetrics.innerHTML = rows.map((row) => `
    <div class="metric-card">
      <span class="metric-card__label">${escapeHtml(row.tenor)}</span>
      <span class="metric-card__value">${escapeHtml(row.mibor)}%</span>
      <span class="metric-card__meta">MIBID ${escapeHtml(row.mibid)} • Previous ${escapeHtml(row.previous)} • Change ${escapeHtml(row.change)}</span>
    </div>
  `).join("");
}

function renderRbi(items) {
  if (!items.length) {
    elements.rbiFeed.innerHTML = `<div class="empty-state">No RBI headlines parsed from the latest fetch.</div>`;
    return;
  }

  elements.rbiFeed.innerHTML = items.map((item) => `
    <article class="feed-item">
      <a class="feed-item__title" href="${escapeAttribute(item.link)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>
      <span class="feed-item__meta">${escapeHtml(formatDate(item.pubDate))}</span>
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

function findCcil(rows, instrument) {
  return rows.find((row) => row.instrument.toLowerCase() === instrument.toLowerCase());
}

function findFimmda(rows, tenor) {
  return rows.find((row) => row.tenor.toLowerCase() === tenor.toLowerCase());
}

function normalizeWhitespace(text) {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(text) {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function formatDate(raw) {
  if (!raw) {
    return "Date unavailable";
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? raw
    : parsed.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.warn("Service worker registration failed", error);
  });
}

function wireInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installMessage.textContent = "This browser supports app install. Use the browser install UI when it appears.";
  });

  elements.refreshButton.addEventListener("click", () => refreshDashboard());

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    elements.installMessage.textContent = "App installed successfully.";
  });
}
