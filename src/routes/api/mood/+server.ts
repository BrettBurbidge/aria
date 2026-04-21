import { json, error } from '@sveltejs/kit';
import { parseMood, rankTracks } from '$lib/services/anthropic.js';
import {
  searchTracks,
  filterByAudioFeatures
} from '$lib/services/spotify.js';
import { getTracksByTags } from '$lib/services/lastfm.js';
import { getLyrics, scoreLyricSentiment } from '$lib/services/genius.js';
import {
  saveMoodSession,
  getTokens,
  saveTokens
} from '$lib/services/db.js';
import { refreshAccessToken } from '$lib/services/spotify.js';
import type { Track, RankedTrack } from '$lib/types.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
  // ── 1. Parse request body ────────────────────────────────────────────────────
  let body: { mood: string; userId: string };

  try {
    body = await request.json();
  } catch {
    error(400, 'Request body must be valid JSON.');
  }

  const { mood, userId } = body;

  if (!mood || typeof mood !== 'string' || mood.trim().length === 0) {
    error(400, 'Field "mood" is required and must be a non-empty string.');
  }

  if (!userId || typeof userId !== 'string') {
    error(400, 'Field "userId" is required.');
  }

  // ── 2. Resolve a valid Spotify access token ────────────────────────────────
  let tokens = await getTokens(userId);

  if (!tokens) {
    error(401, 'No Spotify tokens found for this user. Please reconnect Spotify.');
  }

  // Refresh the token if it has expired (or is within 60 s of expiry)
  const expiresAt = new Date(tokens.expires_at).getTime();
  if (Date.now() >= expiresAt - 60_000) {
    try {
      tokens = await refreshAccessToken(tokens.refresh_token);
      await saveTokens(userId, tokens);
    } catch (refreshErr) {
      console.error('Token refresh failed:', refreshErr);
      error(401, 'Spotify token refresh failed. Please reconnect Spotify.');
    }
  }

  const accessToken = tokens.access_token;

  // ── 3. Parse mood → MoodParams ────────────────────────────────────────────
  const moodParams = await parseMood(mood.trim());
  console.log('[mood] parsed:', JSON.stringify({ mood_label: moodParams.mood_label, genres: moodParams.genres, valence: moodParams.valence, energy: moodParams.energy }));

  // ── 4. Gather candidates in parallel ─────────────────────────────────────
  //       a) Spotify search   b) Last.fm tag lookup
  // Use mood label + top genre as the primary query; genre keyword filters
  // were deprecated by Spotify in Nov 2024 so we pass plain text only.
  const spotifyQuery = [
    moodParams.mood_label,
    moodParams.genres[0] ?? '',
    ...moodParams.keywords.slice(0, 1)
  ].filter(Boolean).join(' ');

  console.log('[mood] spotify query:', spotifyQuery);

  const [spotifyRaw, lastfmRaw] = await Promise.allSettled([
    searchTracks(spotifyQuery, [], accessToken, 40),
    getTracksByTags(moodParams.keywords, 20)
  ]);

  let spotifyTracks: Track[] =
    spotifyRaw.status === 'fulfilled' ? spotifyRaw.value : [];
  const lastfmTracks: Track[] =
    lastfmRaw.status === 'fulfilled' ? lastfmRaw.value : [];

  if (spotifyRaw.status === 'rejected') console.error('[mood] primary Spotify search failed:', spotifyRaw.reason);
  if (lastfmRaw.status === 'rejected') console.warn('[mood] Last.fm search failed:', lastfmRaw.reason);
  console.log(`[mood] candidates: spotify=${spotifyTracks.length}, lastfm=${lastfmTracks.length}`);

  // Also run a second Spotify search per top genre to widen the candidate pool
  try {
    const genreQuery = moodParams.genres[0] ?? '';
    if (genreQuery) {
      // Pass empty genres to avoid building a malformed query like:
      // "dance pop genre:"dance pop"" which Spotify rejects with 400.
      const genreTracks = await searchTracks(
        genreQuery,
        [],
        accessToken,
        20
      );
      // Merge deduplicating by spotify_id
      const seen = new Set(spotifyTracks.map((t) => t.spotify_id));
      for (const t of genreTracks) {
        if (!seen.has(t.spotify_id)) {
          spotifyTracks.push(t);
          seen.add(t.spotify_id);
        }
      }
    }
  } catch (err) {
    console.warn('Secondary genre search failed (non-fatal):', err);
  }

  // ── 5. Filter Spotify tracks by audio features ────────────────────────────
  // NOTE: Spotify deprecated /audio-features for new apps (Nov 2024). The
  // endpoint may return all-null features without throwing, which would silently
  // discard every track. We fall back to unfiltered if we get nothing back.
  let filteredTracks: Track[] = [];
  try {
    filteredTracks = await filterByAudioFeatures(
      spotifyTracks,
      moodParams,
      accessToken
    );
  } catch (err) {
    console.warn('Audio feature filtering failed, using unfiltered:', err);
    filteredTracks = spotifyTracks;
  }

  if (filteredTracks.length === 0 && spotifyTracks.length > 0) {
    console.warn('[mood] Audio feature filter returned 0 tracks (likely deprecated endpoint), using unfiltered.');
    filteredTracks = spotifyTracks;
  }
  console.log(`[mood] after audio filter: ${filteredTracks.length} tracks`);

  // ── 6. Merge Last.fm tags onto matching Spotify tracks ────────────────────
  const lastfmMap = new Map<string, string[]>();
  for (const lfTrack of lastfmTracks) {
    const key = `${lfTrack.name.toLowerCase()}|${lfTrack.artist.toLowerCase()}`;
    const existing = lastfmMap.get(key) ?? [];
    lastfmMap.set(key, [...existing, ...(lfTrack.lastfm_tags ?? [])]);
  }

  const mergedTracks: Track[] = filteredTracks.map((t) => {
    const key = `${t.name.toLowerCase()}|${t.artist.toLowerCase()}`;
    const lfTags = lastfmMap.get(key);
    return lfTags ? { ...t, lastfm_tags: lfTags } : t;
  });

  // Use merged Spotify tracks + any Last.fm-only tracks that we couldn't match
  // (we skip unmatched Last.fm tracks since they lack a spotify_id)
  const candidates = mergedTracks;

  // ── 7. Lyric sentiment for the top N candidates ───────────────────────────
  const TOP_FOR_LYRICS = 10;
  const topCandidates = candidates.slice(0, TOP_FOR_LYRICS);

  await Promise.allSettled(
    topCandidates.map(async (track) => {
      try {
        const lyrics = await getLyrics(track.name, track.artist);
        if (lyrics) {
          track.lyric_sentiment = scoreLyricSentiment(lyrics, moodParams.keywords);
        }
      } catch (err) {
        console.warn(`Lyric fetch failed for "${track.name}" (non-fatal):`, err);
      }
    })
  );

  // Recombine top (with sentiment) + rest
  const allCandidates = [
    ...topCandidates,
    ...candidates.slice(TOP_FOR_LYRICS)
  ];

  console.log(`[mood] final candidates for ranking: ${allCandidates.length}`);

  // ── 8. AI ranking ─────────────────────────────────────────────────────────
  let rankedTracks: RankedTrack[] = [];
  try {
    rankedTracks = await rankTracks(allCandidates, moodParams);
  } catch (err) {
    console.error('rankTracks failed (returning unranked):', err);
    rankedTracks = allCandidates.map((t, i) => ({
      ...t,
      rank_score: Math.max(0, 50 - i),
      rank_reason: 'Matched by audio features.'
    }));
  }

  console.log(`[mood] ranked tracks returned: ${rankedTracks.length}`);

  // ── 9. Persist mood session ────────────────────────────────────────────────
  let sessionId: string;
  try {
    const session = await saveMoodSession({
      user_id: userId,
      mood_input: mood.trim(),
      parsed_params: moodParams
    });
    sessionId = session.id;
  } catch (err) {
    console.error('saveMoodSession failed:', err);
    error(500, 'Failed to save mood session.');
  }

  // ── 10. Return result ──────────────────────────────────────────────────────
  return json(
    {
      session_id: sessionId,
      mood_params: moodParams,
      tracks: rankedTracks
    },
    { status: 200 }
  );
};
