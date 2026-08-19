# Shelf

Things to try, watch, read, and visit — a responsive, mobile-first web app for
tracking recommendations, solo or shared.

## Features

- **Shelves** — typed lists (restaurants, movies, TV series, books, places,
  wishlist) plus a _mixed_ type for trip-style collections.
- **Autofetch** — movies/TV search TMDb, books search Open Library,
  restaurants/places search **Google Places** (or resolve a pasted Google Maps
  link, including `maps.app.goo.gl` short links), wishlist items auto-fill from
  a pasted link's Open Graph tags. Manual entry always works as a fallback.
- **Lifecycle** — items move from _to try_ → _tried_ (or _not for us_), with
  free-form notes instead of ratings.
- **Collaboration** — share a shelf via a revocable invite link; whoever joins
  becomes an editor. Owners manage members.

## Stack

TanStack Start · React 19 · TanStack Query/Router · Drizzle ORM ·
Turso/libSQL · Clerk (email + password) · Tailwind v4 · Motion
(Aceternity-style UI: dark-first zinc + emerald, spotlight, hover highlights)

## Setup

```bash
bun install
bun run db:push           # create tables
bun run dev               # http://localhost:3000
```

### Environment (`.env.local`)

| Variable                       | Purpose                                                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                 | `file:dev.db` locally, `libsql://<db>.turso.io` in production                                                                                  |
| `DATABASE_AUTH_TOKEN`          | Turso auth token (production only)                                                                                                             |
| `CLERK_SECRET_KEY`             | Clerk secret key from the Clerk dashboard                                                                                                      |
| `CLERK_PUBLISHABLE_KEY`        | Clerk publishable key; ships in the client bundle                                                                                              |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Signing secret for Clerk webhooks (user creation/deletion sync)                                                                                |
| `CLERK_FRONTEND_API`           | Optional. Custom Clerk Frontend API origin (e.g. `https://clerk.example.com`) added to CSP. Dev instances on `*.clerk.accounts.dev` are already allowed. |
| `TMDB_API_TOKEN`               | TMDb **API Read Access Token** (v4) from themoviedb.org → Settings → API. Without it, movie/TV search returns nothing (manual entry still works). |
| `GOOGLE_PLACES_API_KEY`        | Google Places API (New) key. Without it, restaurant/place search returns nothing (manual entry still works).                                   |

### Deploying

The database is external (Turso), so the Nitro server output
(`bun run build` → `.output/`) can run on any Node host — Fly.io, Railway,
Render, a VPS. Set the env vars above, pointing `DATABASE_URL` at Turso.

Create the schema on Turso once: set `DATABASE_URL`/`DATABASE_AUTH_TOKEN`
in `.env.local` and run `bun run db:push`.

## Notes

- Dark mode is the default; the header toggle stores an explicit choice.
- Auth is handled by Clerk (email + password, with self-serve password reset).
