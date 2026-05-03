# MarketPulse IN

Static PWA for India money market monitoring. It is designed to be hosted on any HTTPS static host such as GitHub Pages, Netlify, Vercel static hosting, Cloudflare Pages, or an internal web server.

## What it does

- Shows a daily dashboard shell that installs cleanly on iPhone home screen.
- Fetches RBI press release RSS headlines.
- Attempts to parse CCIL money market rates and FIMMDA benchmark rows.
- Caches the app shell offline with a service worker.
- Stores the last successful snapshot in `localStorage` so the dashboard still opens with your last data when a source blocks live fetches.

## Important limitation

This is a client-side PWA. RBI, CCIL, and FIMMDA do not guarantee browser-friendly CORS access for every page, so the app retries through public browser-safe proxy fallbacks. If you want institution-grade reliability, replace the client-side fetches with your own tiny server endpoint or scheduled worker that normalizes these sources.

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
