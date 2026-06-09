# חוסך — landing site

A standalone marketing landing page for חוסך. Plain **HTML + CSS + JS**, RTL
Hebrew, brand-matched (green `#15603E`, lime `#C9EC4B`, cream `#F4F0E8`, Rubik +
Assistant). No framework, no build step, no dependencies.

## Run locally

```bash
cd site
python3 -m http.server 8000   # then open http://localhost:8000
```

…or just open `index.html` in a browser.

## Deploy (pick one)

- **GitHub Pages:** settings → Pages → serve from the `/site` folder (or copy
  its contents to the Pages root).
- **Netlify / Vercel / Cloudflare Pages:** drag-and-drop the `site/` folder, or
  point the project at it. No build command, publish directory = `site`.

## What's inside

`index.html` (sections: hero · providers · how-it-works · categories ·
**interactive savings calculator** · features · testimonials · FAQ · CTA ·
footer) · `styles.css` (responsive, reveal-on-scroll, reduced-motion aware) ·
`script.js` (calculator, animated counter, mobile menu, sticky nav, lead form).

## Customise before going live

Search-and-replace these placeholders:

| Placeholder | Where | Set to |
|-------------|-------|--------|
| `972500000000` | `index.html` (WhatsApp links) | your WhatsApp business number |
| `hello@chosech.co.il` | `index.html` footer | your contact email |
| `SAVE_RATE = 0.45` | `script.js` | tune the calculator's "up to" estimate |

The **lead form** is client-side only for now (shows a thank-you). When the
backend is live, POST `{ name, phone }` to the Supabase `leads` table — see the
`TODO` in `script.js` and `../supabase/`.

## Relationship to the app

This is the **marketing front door**; the Flutter app is the product. The site's
CTAs currently scroll to the calculator / lead form — point the primary buttons
at the app URL (or App Store / Play links) once those exist. Brand tokens here
mirror `lib/theme/app_theme.dart`.
