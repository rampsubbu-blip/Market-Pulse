# MarketPulse IN

Static PWA for India money market monitoring. It is designed to be hosted on any HTTPS static host such as GitHub Pages, Netlify, Vercel static hosting, Cloudflare Pages, or an internal web server.

## What it does

- Shows a daily dashboard shell that installs cleanly on iPhone home screen.
- Fetches RBI press release RSS headlines.
- Attempts to parse CCIL money market rates and FIMMDA benchmark rows.
- Caches the app shell offline with a service worker.
- Stores the last successful snapshot in `localStorage` so the dashboard still opens with your last data when a source blocks live fetches.
- Looks first for `data/latest.json` or `/api/market-data` before falling back to browser-side scraping.

## Important limitation

Pure static hosting is the reason your GitHub Pages build shows no data. RBI, CCIL, and FIMMDA do not reliably allow browser-side cross-origin scraping from an iPhone PWA.

You now have two deployment modes:

1. Static mode on GitHub Pages
- The app reads `data/latest.json`.
- Right now that file is a placeholder.
- Replace it manually or via a scheduled job in GitHub Actions if you want daily static snapshots.

2. Live mode on a host with serverless support
- The app reads `/api/market-data`.
- A starter backend is included at `api/market-data.js`.
- Best fit: deploy the repo to Vercel or Netlify instead of GitHub Pages.
- This gives you a permanent HTTPS URL plus a live JSON endpoint for the PWA.

If you want the feed to work without manual updates, use the second option.

## Local preview

You need to serve the folder over HTTP, not open `index.html` directly:

```powershell
cd "C:\Users\Rama Prakash S\Documents\New project\MarketPulsePWA"
python -m http.server 8080
```

Then open `http://localhost:8080`.

## iPhone install

1. Host this folder at an `https://` URL.
2. Open the URL in Safari on iPhone.
3. Tap `Share`.
4. Tap `Add to Home Screen`.

## Recommended fix for your current GitHub Pages issue

If your current site is on GitHub Pages, it will load the UI but not reliably fetch live RBI, CCIL, and FIMMDA data. The cleanest fix is:

1. Push the same repo to Vercel.
2. Let Vercel deploy both the static PWA and `api/market-data`.
3. Open the Vercel URL on iPhone in Safari.
4. Add it to Home Screen.

That way, the app keeps the same look and install behavior, but the data feed comes from your own backend instead of trying to scrape from the browser.
