# Moodify — Project Documentation

## Overview

Moodify is a mood-based Spotify playlist generator. A user types a natural language mood description ("I'm furious at everything today") and the app uses Claude AI to parse it into music parameters, searches Spotify and Last.fm for matching tracks, optionally scores lyrics for sentiment alignment, ranks the final set with Claude, and writes the finished playlist directly to the user's Spotify account.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend + API routes | SvelteKit 2 + Svelte 5 (TypeScript) |
| Database | Supabase (Postgres) |
| ORM | Prisma 7 with `@prisma/adapter-pg` driver |
| Auth | Spotify OAuth 2.0 (Authorization Code flow) |
| AI | Anthropic Claude (`claude-sonnet-4-6`) |
| Hosting | Vercel (`@sveltejs/adapter-vercel`) |
| HTTP client | Axios |

---

## External APIs

| API | Purpose | Auth |
|---|---|---|
| Anthropic | Mood parsing + track ranking | `ANTHROPIC_API_KEY` |
| Spotify Web API | Track search, audio features, playlist creation | OAuth 2.0 |
| Last.fm | Tag-based track discovery | `LASTFM_API_KEY` (free) |
| Genius | Lyric fetching (HTML scrape) | `GENIUS_ACCESS_TOKEN` |

---

## Environment Variables

```env
# Anthropic
ANTHROPIC_API_KEY=

# Spotify
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/api/auth/callback

# Last.fm
LASTFM_API_KEY=

# Genius
GENIUS_ACCESS_TOKEN=

# Supabase
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Prisma / Postgres
DATABASE_URL=   # Transaction pooler (port 6543) — used at runtime
DIRECT_URL=     # Direct connection (port 5432) — used for migrations/db pull
```

> **Note:** Special characters in database passwords must be URL-encoded (e.g. `@` → `%40`, `*` → `%2A`).

---

## Project Structure

```
aria/
├── prisma/
│   └── schema.prisma          # Prisma data models
├── prisma.config.ts           # Prisma CLI config (loads .env, sets datasource)
├── docs/
│   └── Project.md             # This file
├── schema.sql                 # Raw SQL with RLS policies (for Supabase setup)
├── svelte.config.js           # SvelteKit config (Vercel adapter)
├── vite.config.ts             # Vite config (dev server on 127.0.0.1)
└── src/
    ├── app.html               # HTML shell (Inter font, dark base colour)
    ├── app.d.ts               # SvelteKit ambient types (App.Locals)
    ├── lib/
    │   ├── types.ts           # All TypeScript interfaces
    │   ├── prompts.ts         # Claude prompt builders
    │   └── services/
    │       ├── db.ts          # Prisma singleton + typed DB helpers
    │       ├── anthropic.ts   # parseMood(), rankTracks()
    │       ├── spotify.ts     # OAuth, search, audio features, playlist creation
    │       ├── lastfm.ts      # Tag-based track discovery
    │       ├── genius.ts      # Lyric fetch + keyword sentiment scoring
    │       └── supabase.ts    # Supabase anon client (kept for any client-side use)
    └── routes/
        ├── +layout.server.ts  # Root layout: reads session cookie → provides user to all pages
        ├── +layout.svelte     # Root layout template
        ├── +page.svelte       # Home: mood input, Connect Spotify, user profile card
        ├── api/
        │   └── auth/
        │       ├── spotify/+server.ts   # Initiates Spotify OAuth (GET)
        │       ├── callback/+server.ts  # Handles OAuth callback, sets session cookie (GET)
        │       └── logout/+server.ts    # Clears session cookie, redirects home (POST)
        │   ├── mood/+server.ts          # Main pipeline endpoint (POST)
        │   └── playlist/+server.ts      # Creates Spotify playlist + persists (POST)
        ├── playlist/[id]/
        │   ├── +page.server.ts  # Loads session + playlist from DB
        │   └── +page.svelte     # Track cards, album art, score badges, Save to Spotify
        └── history/
            ├── +page.server.ts  # Loads user's past sessions from DB
            └── +page.svelte     # Session history list
```

---

## Database Schema

### Tables

#### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Generated with `gen_random_uuid()` |
| `spotify_id` | `text` UNIQUE | Spotify's own user ID |
| `display_name` | `text?` | From Spotify profile |
| `email` | `text?` | From Spotify profile |
| `image_url` | `text?` | Spotify profile avatar URL |
| `created_at` | `timestamptz` | Auto-set |

#### `spotify_tokens`
| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` PK FK→users | Cascade delete |
| `access_token` | `text` | Refreshed automatically |
| `refresh_token` | `text` | Stored long-term |
| `expires_at` | `timestamptz` | Checked before every API call |

#### `mood_sessions`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK→users | Cascade delete |
| `mood_input` | `text` | Raw user input |
| `parsed_params` | `jsonb` | `MoodParams` object from Claude |
| `created_at` | `timestamptz` | Indexed DESC |

#### `generated_playlists`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `session_id` | `uuid` FK→mood_sessions | Cascade delete |
| `spotify_playlist_id` | `text?` | Spotify's playlist ID |
| `tracks` | `jsonb` | Array of `RankedTrack` objects |
| `created_at` | `timestamptz` | |

#### `cached_tracks`
| Column | Type | Notes |
|---|---|---|
| `spotify_id` | `text` PK | |
| `name` | `text` | |
| `artist` | `text` | |
| `audio_features` | `jsonb?` | Cached to avoid redundant Spotify API calls |
| `lastfm_tags` | `jsonb?` | |
| `cached_at` | `timestamptz` | |

### Row Level Security

All tables have RLS enabled. Users can only read/write their own rows. `cached_tracks` is publicly readable. All server-side DB operations go through the Prisma client which connects with the Postgres credentials (bypassing RLS).

---

## Authentication Flow

```
User clicks "Connect with Spotify"
  ↓
GET /api/auth/spotify
  → Generates random 32-char hex state string (CSRF protection)
  → Stores state in httpOnly cookie: spotify_oauth_state (path=/, 10 min TTL)
  → Redirects to accounts.spotify.com/authorize with scopes:
      user-read-private, user-read-email,
      playlist-modify-public, playlist-modify-private

Spotify redirects to:
GET /api/auth/callback?code=...&state=...
  → Validates state cookie matches URL param (rejects on mismatch)
  → Deletes state cookie
  → Exchanges code for access_token + refresh_token (Spotify /api/token)
  → Fetches Spotify profile (/v1/me) — id, display_name, email, images[]
  → Upserts user row in DB (spotify_id, display_name, email, image_url)
  → Saves tokens to spotify_tokens table
  → Sets httpOnly session cookie: moodify_uid = <DB UUID> (30 day TTL)
  → Redirects to /?auth=success

Every page load:
  +layout.server.ts reads moodify_uid cookie
  → Fetches user from DB
  → Passes SpotifyUser to all pages via data.user

POST /api/auth/logout
  → Deletes moodify_uid cookie
  → Redirects to /
```

**Session security:** The `moodify_uid` cookie is `httpOnly` (no JS access), `sameSite: lax`, and `secure: true` in production. It contains only a UUID — no tokens or sensitive data are stored client-side.

---

## Core Pipeline (`POST /api/mood`)

**Request:** `{ mood: string, userId: string }`

**Steps:**

1. **Validate** — check mood string and userId are present
2. **Token check** — fetch Spotify tokens from DB; refresh if expired (within 60s)
3. **Mood parsing** — call Claude (`claude-sonnet-4-6`) with `buildMoodParserPrompt(mood)`, returns:
   ```json
   {
     "valence": 0.1,
     "energy": 0.92,
     "tempo": 145,
     "genres": ["metal", "punk"],
     "keywords": ["anger", "defiance"],
     "mood_label": "furious",
     "playlist_name": "Rage Against Everything"
   }
   ```
4. **Parallel search** (Promise.allSettled):
   - **Spotify search** — `genre + keyword` query → up to 40 tracks
   - **Last.fm tag search** — `tag.getTopTracks` for each keyword (300ms delay between tags) → partial tracks (name + artist only, no spotify_id)
   - **Spotify genre search** — secondary search on top genre → up to 20 more tracks
5. **Audio feature filtering** — batch-fetch Spotify audio features (100 IDs/request); keep tracks within ±0.25 of target valence AND energy
6. **Last.fm tag merge** — match Last.fm results to Spotify tracks by `name|artist` key; attach `lastfm_tags` to matching tracks
7. **Lyric sentiment** — for top 10 candidates: fetch lyrics from Genius (HTML scrape of `data-lyrics-container` divs), score keyword frequency (0–1 scale)
8. **AI ranking** — call Claude with `buildRankerPrompt(candidates, moodParams)` → returns array of `{ spotify_id, rank_score, rank_reason }` for 15–20 selected tracks
9. **Persist** — save `MoodSession` to DB with mood input + parsed params
10. **Return** — `{ session_id, mood_params, tracks: RankedTrack[] }`

**Failure handling:** Each step has try/catch. If Spotify search fails, returns empty array. If Last.fm fails, skips tag enrichment. If Genius fails, skips lyric sentiment. If Claude ranking fails, returns candidates in original order with default scores.

---

## Playlist Creation (`POST /api/playlist`)

**Request:** `{ session_id, user_id, tracks: RankedTrack[], playlist_name }`

1. Fetch + refresh Spotify token if needed
2. Look up user's `spotify_id` from DB
3. Build track URIs: `spotify:track:<spotify_id>`
4. Call Spotify `/v1/users/{id}/playlists` to create playlist (private, with Moodify description)
5. Add tracks in chunks of 100 (Spotify limit)
6. Save `GeneratedPlaylist` row to DB
7. Return `{ playlist_id, spotify_url }`

---

## TypeScript Types (`src/lib/types.ts`)

```typescript
MoodParams        // Claude output: valence, energy, tempo, genres[], keywords[], mood_label, playlist_name
AudioFeatures     // Spotify audio features: valence, energy, tempo, danceability, acousticness, instrumentalness, loudness, speechiness
Track             // Core track: spotify_id, name, artist, album, preview_url, image_url, + optional enrichments
RankedTrack       // Track + rank_score (0-100) + rank_reason (string)
MoodSession       // DB row: id, user_id, mood_input, parsed_params, created_at
GeneratedPlaylist // DB row: id, session_id, spotify_playlist_id, tracks[], created_at
SpotifyTokens     // access_token, refresh_token, expires_at
SpotifyUser       // id (DB UUID), spotify_id, display_name, email, image_url
```

---

## Claude Prompts (`src/lib/prompts.ts`)

### `buildMoodParserPrompt(moodInput)`
Instructs Claude to act as a "music mood analysis engine" and return **only** a JSON object with the seven MoodParams fields. No markdown fences, no explanation.

### `buildRankerPrompt(candidates, moodParams)`
Lists all candidate tracks in a numbered format with their audio feature values, Last.fm tags, and lyric sentiment score. Instructs Claude to select 15–20 tracks and return **only** a JSON array of `{ spotify_id, rank_score, rank_reason }`.

Both prompts explicitly forbid markdown fences and extra text. The service layer (`anthropic.ts`) additionally strips fences defensively before JSON parsing.

---

## Spotify Token Refresh

Before every Spotify API call in `/api/mood` and `/api/playlist`, the server checks:

```typescript
const expiresAt = new Date(tokens.expires_at).getTime();
if (Date.now() >= expiresAt - 60_000) {
  tokens = await refreshAccessToken(tokens.refresh_token);
  await saveTokens(userId, tokens);
}
```

Spotify may return a new refresh token on refresh — the code handles that by using the new one if provided, falling back to the existing one otherwise.

---

## Local Development

### Prerequisites
- Node.js 20+
- A Supabase project (free tier works)
- Spotify Developer app
- Anthropic API key
- Last.fm API key
- Genius API client

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in all values
cp .env.example .env

# 3. Push schema to Supabase
#    Option A: paste schema.sql into Supabase SQL editor
#    Option B: use Prisma
npx prisma db push

# 4. Generate Prisma client
npx prisma generate

# 5. Start dev server
npm run dev
# → http://127.0.0.1:5173
```

### Spotify App Configuration
- Redirect URI must be: `http://127.0.0.1:5173/api/auth/callback`
- Required scopes (set automatically by the app): `user-read-private user-read-email playlist-modify-public playlist-modify-private`

### Testing the mood endpoint

```bash
# First log in via the browser to get a user in the DB, then:
curl -X POST http://127.0.0.1:5173/api/mood \
  -H "Content-Type: application/json" \
  -d '{"mood": "I am furious at everything", "userId": "<your-db-uuid>"}'
```

---

## Deployment (Vercel)

```bash
npm run build   # builds with @sveltejs/adapter-vercel
```

Set all environment variables in the Vercel project dashboard. Change `SPOTIFY_REDIRECT_URI` to your production domain before deploying:
```
SPOTIFY_REDIRECT_URI=https://yourdomain.com/api/auth/callback
```

Add the production redirect URI to your Spotify app's allowed redirect URIs.

---

## Known Limitations & Notes

- **Genius lyrics scraping** — Genius does not expose lyrics via their official API. The app scrapes the lyric page HTML. This can break if Genius changes their markup.
- **Last.fm tracks lack Spotify IDs** — Last.fm returns track names/artists only. The pipeline matches them to Spotify tracks by name. Unmatched Last.fm tracks are discarded.
- **Audio features deprecation** — Spotify deprecated the audio features endpoint for new apps in late 2024. Existing apps retain access; new Spotify Developer apps may not have access to `/v1/audio-features`.
- **No real-time updates** — playlist generation is synchronous (can take 5–15 seconds). A future improvement would stream progress to the client via SSE.
- **Session storage** — user identity is stored in an httpOnly cookie (not Supabase Auth). The Supabase anon client is available but RLS policies are not enforced at the application layer — the Prisma client connects with Postgres credentials directly.
