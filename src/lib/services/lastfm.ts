import axios from 'axios';
import { LASTFM_API_KEY } from '$env/static/private';
import type { Track } from '$lib/types.js';

const LASTFM_API = 'https://ws.audioscrobbler.com/2.0/';

/** Milliseconds to wait between tag requests to avoid hammering the Last.fm API. */
const TAG_REQUEST_DELAY_MS = 300;

interface LastFmTrack {
  name: string;
  artist: { name: string } | string;
  mbid?: string;
  url?: string;
}

interface LastFmTagTopTracksResponse {
  tracks?: {
    track?: LastFmTrack[];
  };
}

/**
 * For each tag, fetches the top tracks from Last.fm, deduplicates by
 * "name|artist" key, and returns partial Track objects.
 * Note: spotify_id will be empty — callers are expected to match/enrich
 * these results using Spotify search.
 */
export async function getTracksByTags(
  tags: string[],
  limit = 20
): Promise<Track[]> {
  const seen = new Set<string>();
  const results: Track[] = [];

  for (const tag of tags) {
    try {
      const response = await axios.get<LastFmTagTopTracksResponse>(LASTFM_API, {
        params: {
          method: 'tag.getTopTracks',
          tag,
          api_key: LASTFM_API_KEY,
          format: 'json',
          limit
        }
      });

      const tracks = response.data?.tracks?.track ?? [];

      for (const t of tracks) {
        const artistName =
          typeof t.artist === 'string' ? t.artist : t.artist?.name ?? '';
        const key = `${t.name.toLowerCase()}|${artistName.toLowerCase()}`;

        if (seen.has(key)) continue;
        seen.add(key);

        results.push({
          spotify_id: '',   // Not yet resolved
          name: t.name,
          artist: artistName,
          album: '',
          preview_url: null,
          image_url: null,
          lastfm_tags: [tag]
        });
      }
    } catch (err) {
      // Log but don't throw — a single failed tag shouldn't abort the pipeline
      console.warn(`getTracksByTags: failed to fetch tag "${tag}":`, err);
    }

    // Polite delay between requests
    if (tags.indexOf(tag) < tags.length - 1) {
      await delay(TAG_REQUEST_DELAY_MS);
    }
  }

  return results;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
