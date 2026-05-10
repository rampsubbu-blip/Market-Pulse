# MarketPulse IN

Minimal PWA for two things only:

- RBI T-bill cut-off yields: 91-day, 182-day, 364-day
- Daily primary issuances in CP, CD, and NCD from CCIL F-TRAC market-watch pages

## Live data sources

- RBI home page for T-bill cut-off yields
- CCIL F-TRAC:
  - `CP_PRI_MEM_MARK_WATC_VIEW.aspx`
  - `CD_PRI_MEM_MARK_WATC_VIEW.aspx`
  - `NC_PRI_MEM_MARK_WATC_VIEW.aspx`

## Hosting

Use a host with serverless support, such as Vercel, so `api/market-data.js` can fetch and normalize the official pages.

## iPhone install

1. Open the hosted `https://` URL in Safari.
2. Tap `Share`.
3. Tap `Add to Home Screen`.
