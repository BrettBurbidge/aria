import { json, error } from '@sveltejs/kit';
import {
  getTokens,
  saveTokens,
  saveGeneratedPlaylist,
  getUserById
} from '$lib/services/db.js';
import {
  createPlaylist,
  refreshAccessToken
} from '$lib/services/spotify.js';
import type { RankedTrack } from '$lib/types.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
  // ── 1. Parse request body ────────────────────────────────────────────────
  let body: {
    session_id: string;
    user_id: string;
    tracks: RankedTrack[];
    playlist_name: string;
  };

  try {
    body = await request.json();
  } catch {
    error(400, 'Request body must be valid JSON.');
  }

  const { session_id, user_id, tracks, playlist_name } = body;

  if (!session_id || !user_id || !Array.isArray(tracks) || !playlist_name) {
    error(
      400,
      'Fields "session_id", "user_id", "tracks", and "playlist_name" are all required.'
    );
  }

  if (tracks.length === 0) {
    error(400, 'tracks array must not be empty.');
  }

  // ── 2. Resolve Spotify access token ─────────────────────────────────────
  let tokens = await getTokens(user_id);

  if (!tokens) {
    error(401, 'No Spotify tokens found. Please reconnect your Spotify account.');
  }

  // Refresh if expired or about to expire
  const expiresAt = new Date(tokens.expires_at).getTime();
  if (Date.now() >= expiresAt - 60_000) {
    try {
      tokens = await refreshAccessToken(tokens.refresh_token);
      await saveTokens(user_id, tokens);
    } catch (refreshErr) {
      console.error('Token refresh failed:', refreshErr);
      error(401, 'Spotify token refresh failed. Please reconnect Spotify.');
    }
  }

  const accessToken = tokens.access_token;

  // ── 3. Resolve the user's Spotify ID ────────────────────────────────────
  let spotifyUserId: string;
  try {
    const user = await getUserById(user_id);
    if (!user) error(404, 'User not found.');
    spotifyUserId = user.spotify_id;
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) throw err;
    console.error('Failed to resolve spotify_id:', err);
    error(500, 'Failed to resolve user Spotify ID.');
  }

  // ── 4. Build track URIs ──────────────────────────────────────────────────
  const trackUris = tracks
    .filter((t) => t.spotify_id)
    .map((t) => `spotify:track:${t.spotify_id}`);

  if (trackUris.length === 0) {
    error(400, 'None of the provided tracks have valid Spotify IDs.');
  }

  // ── 5. Create the Spotify playlist ──────────────────────────────────────
  let spotifyPlaylistId: string;
  try {
    spotifyPlaylistId = await createPlaylist(
      spotifyUserId,
      playlist_name,
      trackUris,
      accessToken
    );
  } catch (err) {
    console.error('createPlaylist failed:', err);
    error(502, 'Failed to create playlist on Spotify.');
  }

  // ── 6. Persist to Supabase ───────────────────────────────────────────────
  try {
    await saveGeneratedPlaylist({
      session_id,
      spotify_playlist_id: spotifyPlaylistId,
      tracks
    });
  } catch (err) {
    // Don't fail the whole request if persistence fails — the playlist was created
    console.error('saveGeneratedPlaylist failed (non-fatal):', err);
  }

  // ── 7. Return result ─────────────────────────────────────────────────────
  const spotifyUrl = `https://open.spotify.com/playlist/${spotifyPlaylistId}`;

  return json(
    { playlist_id: spotifyPlaylistId, spotify_url: spotifyUrl },
    { status: 201 }
  );
};
