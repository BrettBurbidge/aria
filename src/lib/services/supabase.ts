import { createClient } from '@supabase/supabase-js';
import {
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY
} from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { MoodParams, RankedTrack, SpotifyTokens } from '$lib/types.js';

// ── Clients ──────────────────────────────────────────────────────────────────

/** Client-side (anon) Supabase client — safe to expose in the browser. */
export const supabaseClient = createClient(
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY
);

/** Server-side (service role) Supabase client — NEVER expose to the browser. */
export const supabaseAdmin = createClient(
  PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── User helpers ──────────────────────────────────────────────────────────────

export async function getUserBySpotifyId(spotifyId: string) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('spotify_id', spotifyId)
    .maybeSingle();

  if (error) throw new Error(`getUserBySpotifyId: ${error.message}`);
  return data;
}

export async function upsertUser(payload: {
  spotify_id: string;
  display_name?: string;
  email?: string;
}) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .upsert(payload, { onConflict: 'spotify_id' })
    .select()
    .single();

  if (error) throw new Error(`upsertUser: ${error.message}`);
  return data;
}

// ── Token helpers ─────────────────────────────────────────────────────────────

export async function saveTokens(userId: string, tokens: SpotifyTokens) {
  const { error } = await supabaseAdmin.from('spotify_tokens').upsert(
    {
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at
    },
    { onConflict: 'user_id' }
  );

  if (error) throw new Error(`saveTokens: ${error.message}`);
}

export async function getTokens(userId: string): Promise<SpotifyTokens | null> {
  const { data, error } = await supabaseAdmin
    .from('spotify_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`getTokens: ${error.message}`);
  if (!data) return null;

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at
  };
}

// ── Mood session helpers ──────────────────────────────────────────────────────

export async function saveMoodSession(payload: {
  user_id: string;
  mood_input: string;
  parsed_params: MoodParams;
}) {
  const { data, error } = await supabaseAdmin
    .from('mood_sessions')
    .insert({
      user_id: payload.user_id,
      mood_input: payload.mood_input,
      parsed_params: payload.parsed_params
    })
    .select()
    .single();

  if (error) throw new Error(`saveMoodSession: ${error.message}`);
  return data;
}

export async function getMoodSession(sessionId: string) {
  const { data, error } = await supabaseAdmin
    .from('mood_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) throw new Error(`getMoodSession: ${error.message}`);
  return data;
}

export async function getMoodSessionsByUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('mood_sessions')
    .select(
      `*,
       generated_playlists ( id, spotify_playlist_id, created_at )`
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`getMoodSessionsByUser: ${error.message}`);
  return data ?? [];
}

// ── Playlist helpers ──────────────────────────────────────────────────────────

export async function saveGeneratedPlaylist(payload: {
  session_id: string;
  spotify_playlist_id: string;
  tracks: RankedTrack[];
}) {
  const { data, error } = await supabaseAdmin
    .from('generated_playlists')
    .insert({
      session_id: payload.session_id,
      spotify_playlist_id: payload.spotify_playlist_id,
      tracks: payload.tracks
    })
    .select()
    .single();

  if (error) throw new Error(`saveGeneratedPlaylist: ${error.message}`);
  return data;
}

export async function getGeneratedPlaylist(sessionId: string) {
  const { data, error } = await supabaseAdmin
    .from('generated_playlists')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) throw new Error(`getGeneratedPlaylist: ${error.message}`);
  return data;
}

// ── Cached track helpers ──────────────────────────────────────────────────────

export async function getCachedTrack(spotifyId: string) {
  const { data, error } = await supabaseAdmin
    .from('cached_tracks')
    .select('*')
    .eq('spotify_id', spotifyId)
    .maybeSingle();

  if (error) throw new Error(`getCachedTrack: ${error.message}`);
  return data;
}

export async function upsertCachedTrack(payload: {
  spotify_id: string;
  name: string;
  artist: string;
  audio_features?: object;
  lastfm_tags?: object;
}) {
  const { error } = await supabaseAdmin
    .from('cached_tracks')
    .upsert({ ...payload, cached_at: new Date().toISOString() }, { onConflict: 'spotify_id' });

  if (error) throw new Error(`upsertCachedTrack: ${error.message}`);
}
