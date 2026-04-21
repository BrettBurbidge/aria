import axios from 'axios';
import {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI
} from '$env/static/private';
import type { AudioFeatures, MoodParams, SpotifyTokens, Track } from '$lib/types.js';

const SPOTIFY_API = 'https://api.spotify.com/v1';
const SPOTIFY_ACCOUNTS = 'https://accounts.spotify.com';

// Scopes required for full Moodify functionality
const SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-library-read'
].join(' ');

// ── Auth ──────────────────────────────────────────────────────────────────────

export function getSpotifyAuthUrl(): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    show_dialog: 'false'
  });

  return `${SPOTIFY_ACCOUNTS}/authorize?${params.toString()}`;
}

/** Exchange an authorization code for access + refresh tokens. */
export async function getAccessToken(code: string): Promise<SpotifyTokens> {
  const credentials = Buffer.from(
    `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');

  const response = await axios.post<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  }>(
    `${SPOTIFY_ACCOUNTS}/api/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`
      }
    }
  );

  console.log('[spotify auth] granted scopes:', response.data.scope);

  const expiresAt = new Date(
    Date.now() + response.data.expires_in * 1000
  ).toISOString();

  return {
    access_token: response.data.access_token,
    refresh_token: response.data.refresh_token,
    expires_at: expiresAt
  };
}

/** Use a refresh token to obtain a new access token. */
export async function refreshAccessToken(
  refreshToken: string
): Promise<SpotifyTokens> {
  const credentials = Buffer.from(
    `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');

  const response = await axios.post<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>(
    `${SPOTIFY_ACCOUNTS}/api/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`
      }
    }
  );

  const expiresAt = new Date(
    Date.now() + response.data.expires_in * 1000
  ).toISOString();

  return {
    access_token: response.data.access_token,
    // Spotify may or may not return a new refresh token
    refresh_token: response.data.refresh_token ?? refreshToken,
    expires_at: expiresAt
  };
}

// ── Profile ───────────────────────────────────────────────────────────────────

export interface SpotifyProfile {
  id: string;
  display_name: string | null;
  email: string;
  image_url: string | null;
}

/** Fetch the authenticated user's Spotify profile, including their avatar. */
export async function getSpotifyProfile(accessToken: string): Promise<SpotifyProfile> {
  const response = await axios.get<{
    id: string;
    display_name: string | null;
    email: string;
    images: { url: string; height: number | null; width: number | null }[];
  }>(`${SPOTIFY_API}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const { id, display_name, email, images } = response.data;
  // Prefer the smallest image (last in array) to avoid loading a huge avatar
  const image_url = images?.length ? images[images.length - 1].url : null;

  return { id, display_name: display_name ?? null, email, image_url };
}

// ── Search ────────────────────────────────────────────────────────────────────

/** Search Spotify for tracks matching the given query. */
export async function searchTracks(
  query: string,
  _genres: string[],   // kept for call-site compatibility; genre keyword filter deprecated by Spotify Nov 2024
  accessToken: string,
  limit = 20
): Promise<Track[]> {
  const params = new URLSearchParams({
    q: query,
    type: 'track'
  });

  const res = await fetch(`${SPOTIFY_API}/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[spotify search] status:', res.status);
    console.error('[spotify search] body:', body);
    throw new Error(`Spotify search failed: ${res.status} ${body}`);
  }

  const data = await res.json() as { tracks: { items: SpotifyTrackItem[] } };
  return (data.tracks?.items ?? []).map(mapSpotifyTrack);
}

// ── Audio Features ────────────────────────────────────────────────────────────

/** Batch-fetch audio features for up to 100 track IDs. */
export async function getAudioFeatures(
  trackIds: string[],
  accessToken: string
): Promise<Map<string, AudioFeatures>> {
  const result = new Map<string, AudioFeatures>();
  if (trackIds.length === 0) return result;

  // Spotify allows up to 100 IDs per request
  const chunks = chunkArray(trackIds, 100);

  for (const chunk of chunks) {
    const response = await axios.get<{
      audio_features: (SpotifyAudioFeature | null)[];
    }>(`${SPOTIFY_API}/audio-features`, {
      params: { ids: chunk.join(',') },
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    for (const af of response.data.audio_features ?? []) {
      if (!af) continue;
      result.set(af.id, {
        valence: af.valence,
        energy: af.energy,
        tempo: af.tempo,
        danceability: af.danceability,
        acousticness: af.acousticness,
        instrumentalness: af.instrumentalness,
        loudness: af.loudness,
        speechiness: af.speechiness
      });
    }
  }

  return result;
}

/** Fetch audio features for a track list, then filter to tracks within ±0.25
 *  of the target valence AND energy. Returns annotated Track objects. */
export async function filterByAudioFeatures(
  tracks: Track[],
  moodParams: MoodParams,
  accessToken: string
): Promise<Track[]> {
  const ids = tracks.map((t) => t.spotify_id).filter(Boolean);
  const featureMap = await getAudioFeatures(ids, accessToken);

  const TOLERANCE = 0.25;

  return tracks
    .map((t) => {
      const af = featureMap.get(t.spotify_id);
      return af ? { ...t, audio_features: af } : t;
    })
    .filter((t) => {
      const af = t.audio_features;
      if (!af) return false;
      return (
        Math.abs(af.valence - moodParams.valence) <= TOLERANCE &&
        Math.abs(af.energy - moodParams.energy) <= TOLERANCE
      );
    });
}

// ── Playlist creation ─────────────────────────────────────────────────────────

/**
 * Create a new private Spotify playlist, add the given track URIs, and return
 * the new playlist's Spotify ID.
 */
export async function createPlaylist(
  userId: string,
  name: string,
  trackUris: string[],
  accessToken: string
): Promise<string> {
  // 1. Create the empty playlist
  const createRes = await fetch(`${SPOTIFY_API}/me/playlists`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name,
      description: 'Generated by Aria — your AI mood-based DJ.',
      public: true
    })
  });

  if (!createRes.ok) {
    const body = await createRes.text();
    console.error('[spotify createPlaylist] create failed:', createRes.status, body);
    throw new Error(`Failed to create playlist: ${createRes.status} ${body}`);
  }

  const createData = await createRes.json() as { id: string };
  const playlistId = createData.id;
  console.log('[spotify createPlaylist] created playlist:', playlistId);

  // 2. Add tracks in chunks of 100 (Spotify limit)
  const chunks = chunkArray(trackUris, 100);
  for (const chunk of chunks) {
    const urisParam = chunk.join(',');
    const addRes = await fetch(
      `${SPOTIFY_API}/playlists/${playlistId}/items?uris=${encodeURIComponent(urisParam)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      }
    );

    if (!addRes.ok) {
      const body = await addRes.text();
      console.error('[spotify createPlaylist] add tracks failed:', addRes.status, body);
      throw new Error(`Failed to add tracks: ${addRes.status} ${body}`);
    }
  }

  return playlistId;
}

// ── Internal mappers & types ──────────────────────────────────────────────────

interface SpotifyTrackItem {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string; width: number; height: number }[];
  };
  preview_url: string | null;
}

interface SpotifyAudioFeature {
  id: string;
  valence: number;
  energy: number;
  tempo: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  loudness: number;
  speechiness: number;
}

function mapSpotifyTrack(item: SpotifyTrackItem): Track {
  const images = item.album?.images ?? [];
  // Prefer a medium-sized image (index 1), fall back to the first one
  const image_url = images[1]?.url ?? images[0]?.url ?? null;

  return {
    spotify_id: item.id,
    name: item.name,
    artist: item.artists?.[0]?.name ?? 'Unknown Artist',
    album: item.album?.name ?? '',
    preview_url: item.preview_url,
    image_url
  };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
