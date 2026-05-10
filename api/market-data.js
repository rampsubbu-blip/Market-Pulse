export default async function handler(request, response) {
  try {
    const [rbiHomeText, cpPrimaryText, cdPrimaryText, ncdPrimaryText] = await Promise.all([
      fetchText("https://www.rbi.org.in/home.aspx"),
      fetchText("https://www.ftrac.co.in/CP_PRI_MEM_MARK_WATC_VIEW.aspx"),
      fetchText("https://www.ftrac.co.in/CD_PRI_MEM_MARK_WATC_VIEW.aspx"),
      fetchText("https://www.ftrac.co.in/NC_PRI_MEM_MARK_WATC_VIEW.aspx")
    ]);

    const payload = {
      fetchedAt: new Date().toISOString(),
      tBills: parseRbiTBills(rbiHomeText),
      cpPrimary: parsePrimaryRows(cpPrimaryText),
      cdPrimary: parsePrimaryRows(cdPrimaryText),
      ncdPrimary: parsePrimaryRows(ncdPrimaryText),
      errors: []
    };

    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
    response.status(200).json(payload);
  } catch (error) {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.status(500).json({
      fetchedAt: new Date().toISOString(),
      tBills: [],
      cpPrimary: [],
      cdPrimary: [],
      ncdPrimary: [],
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

function parseRbiTBills(text) {
  const normalized = normalizeWhitespace(text);
  const asOnMatch = normalized.match(/\* cut-off at the last auction\s+# as on ([A-Za-z]+\s+\d{2},\s+\d{4})/i);
  const asOn = asOnMatch ? asOnMatch[1] : "";
  const pattern = /(91 day T-bills|182 day T-bills|364 day T-bills)\s*:\s*([\d.]+)%\*/gi;
  const rows = [];
  let match;

  while ((match = pattern.exec(normalized)) !== null) {
    rows.push({
      instrument: toTitleCase(match[1]),
      tenor: match[1].split(" ")[0],
      yield: match[2],
      asOn
    });
  }

  return dedupeByLabel(rows, (row) => row.instrument).slice(0, 3);
}

function parsePrimaryRows(text) {
  const normalized = normalizeWhitespace(text);
  const pattern = /(INE[0-9A-Z]+)\s+(.+?)\s+(\d{2}-[A-Za-z]{3}-\d{4})\s+(\d+)\s+(.+?)\s+(T\+\d)\s+(\d+)\s+([\d,]+\.\d+)\s+([\d.]+)\s*-\s*([\d.]+)\s+([\d.]+)\s*-\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/gi;
  const rows = [];
  let match;

  while ((match = pattern.exec(normalized)) !== null) {
    rows.push({
      isin: match[1],
      description: match[2].trim(),
      maturityDate: match[3],
      residualDays: match[4],
      issuer: match[5].trim(),
      settlementType: match[6],
      trades: match[7],
      issueAmount: match[8],
      yieldFrom: match[9],
      yieldTo: match[10],
      priceFrom: match[11],
      priceTo: match[12],
      wap: match[13],
      way: match[14]
    });
  }

  return rows.slice(0, 12);
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

function toTitleCase(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
