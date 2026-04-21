import { json, error } from '@sveltejs/kit';
import { rankTracks } from '$lib/services/anthropic.js';
import { searchTracks, filterByAudioFeatures, refreshAccessToken } from '$lib/services/spotify.js';
import { getMoodSession, getTokens, saveTokens } from '$lib/services/db.js';
import type { Track } from '$lib/types.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
  let body: { session_id: string; user_id: string; exclude_ids: string[] };

  try {
    body = await request.json();
  } catch {
    error(400, 'Request body must be valid JSON.');
  }

  const { session_id, user_id, exclude_ids } = body;

  if (!session_id || !user_id) error(400, 'session_id and user_id are required.');

  // ── Load session to get moodParams ─────────────────────────────────────────
  const session = await getMoodSession(session_id);
  if (!session) error(404, 'Mood session not found.');

  const moodParams = session.parsed_params as import('$lib/types.js').MoodParams;
  const excluded = new Set(Array.isArray(exclude_ids) ? exclude_ids : []);

  // ── Resolve access token ───────────────────────────────────────────────────
  let tokens = await getTokens(user_id);
  if (!tokens) error(401, 'No Spotify tokens found. Please reconnect Spotify.');

  const expiresAt = new Date(tokens.expires_at).getTime();
  if (Date.now() >= expiresAt - 60_000) {
    try {
      tokens = await refreshAccessToken(tokens.refresh_token);
      await saveTokens(user_id, tokens);
    } catch {
      error(401, 'Spotify token refresh failed. Please reconnect Spotify.');
    }
  }

  const accessToken = tokens.access_token;

  // ── Run varied searches to surface new candidates ─────────────────────────
  // Rotate through keywords and genres so we don't just repeat the same query.
  const queries = [
    moodParams.keywords[1] ?? moodParams.mood_label,
    moodParams.genres[1] ?? moodParams.genres[0],
    [moodParams.keywords[2] ?? '', moodParams.genres[2] ?? ''].filter(Boolean).join(' ')
  ].filter(Boolean);

  const searchResults = await Promise.allSettled(
    queries.map((q) => searchTracks(q, [], accessToken, 30))
  );

  const seen = new Set<string>(excluded);
  const candidates: Track[] = [];

  for (const result of searchResults) {
    if (result.status !== 'fulfilled') continue;
    for (const track of result.value) {
      if (!seen.has(track.spotify_id)) {
        seen.add(track.spotify_id);
        candidates.push(track);
      }
    }
  }

  if (candidates.length === 0) {
    return json({ tracks: [] });
  }

  // ── Audio feature filter (best-effort) ────────────────────────────────────
  let filtered: Track[] = candidates;
  try {
    const f = await filterByAudioFeatures(candidates, moodParams, accessToken);
    if (f.length > 0) filtered = f;
  } catch {
    // deprecated endpoint — proceed unfiltered
  }

  // ── AI ranking ─────────────────────────────────────────────────────────────
  const ranked = await rankTracks(filtered, moodParams);

  return json({ tracks: ranked });
};
