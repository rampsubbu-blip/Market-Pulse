export default async function handler(request, response) {
  try {
    const [rbiText, ccilText, fimmdaText] = await Promise.all([
      fetchText("https://rbi.org.in/pressreleases_rss.xml"),
      fetchText("https://www.ccilindia.com/money-market-rates-and-volumes-most-liquid-tenor-"),
      fetchText("https://www.fimmda.org/NSE.aspx")
    ]);

    const payload = {
      fetchedAt: new Date().toISOString(),
      rbi: parseRbiFeed(rbiText),
      ccil: parseCcilPage(ccilText),
      fimmda: parseFimmdaPage(fimmdaText),
      errors: []
    };

    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
    response.status(200).json(payload);
  } catch (error) {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.status(500).json({
      fetchedAt: new Date().toISOString(),
      rbi: [],
      ccil: [],
      fimmda: [],
      errors: [error.message || "Unknown backend error"]
    });
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "MarketPulse-IN/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed for ${url} with status ${response.status}`);
  }

  return response.text();
}

function parseRbiFeed(text) {
  return [...text.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>/gi)]
    .map((match) => ({
      title: stripCdata(decodeXml(match[1]).trim()),
      link: decodeXml(match[2]).trim(),
      pubDate: decodeXml(match[3]).trim()
    }))
    .filter((item) => item.title && item.link)
    .slice(0, 6);
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
  const pattern = /(OVERNIGHT|3 DAY|14 DAY|1 MONTH|3 MONTH|6 MONTH|1 YEAR)\s+(\d{1,2}:\d{2}\s*[ap]\.m\.)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/gi;
  const rows = [];
  let match;

  while ((match = pattern.exec(normalized)) !== null) {
    rows.push({
      tenor: toTitleCase(match[1]),
      time: match[2],
      mibid: match[3],
      mibidStd: match[4],
      mibor: match[5],
      miborStd: match[6]
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

function normalizeWhitespace(text) {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(text) {
  return String(text ?? "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function stripCdata(text) {
  return String(text ?? "").replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function toTitleCase(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
