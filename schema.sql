-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  spotify_id    text        UNIQUE NOT NULL,
  display_name  text,
  email         text,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spotify_tokens (
  user_id       uuid        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token  text        NOT NULL,
  refresh_token text        NOT NULL,
  expires_at    timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS mood_sessions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES users(id) ON DELETE CASCADE,
  mood_input    text        NOT NULL,
  parsed_params jsonb,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS generated_playlists (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid        REFERENCES mood_sessions(id) ON DELETE CASCADE,
  spotify_playlist_id text,
  tracks              jsonb       NOT NULL,
  created_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cached_tracks (
  spotify_id      text        PRIMARY KEY,
  name            text        NOT NULL,
  artist          text        NOT NULL,
  audio_features  jsonb,
  lastfm_tags     jsonb,
  cached_at       timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE spotify_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mood_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_playlists ENABLE ROW LEVEL SECURITY;

-- cached_tracks is publicly readable (no sensitive data)
ALTER TABLE cached_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cached_tracks_public_read"
  ON cached_tracks FOR SELECT
  USING (true);

CREATE POLICY "cached_tracks_service_write"
  ON cached_tracks FOR ALL
  USING (auth.role() = 'service_role');

-- ─── users ───────────────────────────────────────────────────────────────────

CREATE POLICY "users_select_own"
  ON users FOR SELECT
  USING (auth.uid()::text = spotify_id OR id = auth.uid());

CREATE POLICY "users_insert_own"
  ON users FOR INSERT
  WITH CHECK (true);

CREATE POLICY "users_update_own"
  ON users FOR UPDATE
  USING (id = auth.uid());

-- ─── spotify_tokens ───────────────────────────────────────────────────────────

CREATE POLICY "tokens_select_own"
  ON spotify_tokens FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "tokens_insert_own"
  ON spotify_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "tokens_update_own"
  ON spotify_tokens FOR UPDATE
  USING (user_id = auth.uid());

-- ─── mood_sessions ────────────────────────────────────────────────────────────

CREATE POLICY "sessions_select_own"
  ON mood_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "sessions_insert_own"
  ON mood_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "sessions_update_own"
  ON mood_sessions FOR UPDATE
  USING (user_id = auth.uid());

-- ─── generated_playlists ─────────────────────────────────────────────────────

CREATE POLICY "playlists_select_own"
  ON generated_playlists FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM mood_sessions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "playlists_insert_own"
  ON generated_playlists FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT id FROM mood_sessions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "playlists_update_own"
  ON generated_playlists FOR UPDATE
  USING (
    session_id IN (
      SELECT id FROM mood_sessions WHERE user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_mood_sessions_user_id
  ON mood_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_mood_sessions_created_at
  ON mood_sessions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generated_playlists_session_id
  ON generated_playlists(session_id);

CREATE INDEX IF NOT EXISTS idx_spotify_tokens_user_id
  ON spotify_tokens(user_id);
