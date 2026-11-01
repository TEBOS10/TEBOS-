# Hosting Grape Studios' site

Grape's site is the `dist-grape` build (`npm run build:grape` in `tebos/web`). It is a static site: it talks to TEBOS
only through Supabase's public functions with the publishable key, so any static host works.

## Recommended: Cloudflare Pages (free, commercial use allowed; decision 31)

1. Sign in at dash.cloudflare.com (a free account, on Grape's or the founder's email: the founder decides whose).
2. Workers & Pages → Create → Pages → Connect to Git → choose `TEBOS10/TEBOS-`.
3. Settings:
   - Production branch: `main`
   - Root directory: `tebos/web`
   - Build command: `npm ci && npm run build:grape`
   - Build output directory: `dist-grape`
   - Environment variables (both are public by design, never a secret key):
     - `VITE_SUPABASE_URL` = `https://jjibuvqpidimckmrhlqa.supabase.co`
     - `VITE_SUPABASE_PUBLISHABLE_KEY` = the project's publishable key (`sb_publishable_…`)
   - `NODE_VERSION` = `22`
4. Deploy. The site's routing (`_redirects`) and security headers (`_headers`) ship with the build.
5. Custom domain: Pages project → Custom domains → add the domain, then follow its DNS steps.

## The domain

- `grapestudios.com` is taken.
- `grapestudios.co.za` is available (1 Nov 2026), from a South African registrar.
- `grapestudios.photography` is available too: USD 9.99 for the first year, then USD 33 a year.

Buying the domain is the founder's (or Grape's) decision. It should be registered in Grape's name, so Grape owns it
(ADR 0012).
