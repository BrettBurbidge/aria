import axios from 'axios';
import { GENIUS_ACCESS_TOKEN } from '$env/static/private';

const GENIUS_API = 'https://api.genius.com';

interface GeniusSearchHit {
  result: {
    id: number;
    title: string;
    primary_artist: { name: string };
    url: string;
  };
}

interface GeniusSearchResponse {
  response: {
    hits: GeniusSearchHit[];
  };
}

/**
 * Search the Genius API for a song, then scrape the lyric page to extract
 * plain-text lyrics. Returns null if the track is not found or scraping fails.
 *
 * Note: Genius does not provide lyrics via their official API — we must fetch
 * the HTML page and strip tags to get the raw text.
 */
export async function getLyrics(
  trackName: string,
  artistName: string
): Promise<string | null> {
  try {
    // 1. Search Genius for the track
    const searchRes = await axios.get<GeniusSearchResponse>(
      `${GENIUS_API}/search`,
      {
        params: { q: `${trackName} ${artistName}` },
        headers: { Authorization: `Bearer ${GENIUS_ACCESS_TOKEN}` }
      }
    );

    const hits = searchRes.data?.response?.hits ?? [];
    if (hits.length === 0) return null;

    // Find the best matching hit (case-insensitive title + artist comparison)
    const normalizedTrack = trackName.toLowerCase();
    const normalizedArtist = artistName.toLowerCase();

    const bestHit =
      hits.find(
        (h) =>
          h.result.title.toLowerCase().includes(normalizedTrack) &&
          h.result.primary_artist.name.toLowerCase().includes(normalizedArtist)
      ) ?? hits[0];

    const songUrl = bestHit.result.url;

    // 2. Fetch the Genius lyric page HTML
    const pageRes = await axios.get<string>(songUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; Aria/1.0; +https://aria.app)'
      },
      // Treat response as text
      responseType: 'text'
    });

    const html: string = pageRes.data;

    // 3. Extract lyric containers and strip HTML tags
    const lyrics = extractLyricsFromHtml(html);
    return lyrics || null;
  } catch (err) {
    console.warn(
      `getLyrics: failed for "${trackName}" by "${artistName}":`,
      err
    );
    return null;
  }
}

/**
 * Simple keyword-based sentiment scorer.
 * Returns a value 0–1 indicating how well the lyrics match the provided mood keywords.
 * Algorithm: count keyword occurrences / total word count, then scale and clamp.
 */
export function scoreLyricSentiment(lyrics: string, keywords: string[]): number {
  if (!lyrics || lyrics.length === 0 || keywords.length === 0) return 0.5;

  const lowerLyrics = lyrics.toLowerCase();
  const words = lowerLyrics.split(/\s+/).filter(Boolean);
  const totalWords = words.length;

  if (totalWords === 0) return 0.5;

  let matchCount = 0;
  for (const keyword of keywords) {
    const kw = keyword.toLowerCase();
    // Count all occurrences of the keyword in the lyrics
    let startIdx = 0;
    while (true) {
      const idx = lowerLyrics.indexOf(kw, startIdx);
      if (idx === -1) break;
      matchCount++;
      startIdx = idx + kw.length;
    }
  }

  // Scale factor: a match rate of 1% of total words = 0.5 score baseline
  // Multiply by 50 so that 2 matches per 100 words = score of 1.0 (clamped)
  const rawScore = (matchCount / totalWords) * 50;
  return Math.min(Math.max(rawScore, 0), 1);
}

// ── Private helpers ───────────────────────────────────────────────────────────

function extractLyricsFromHtml(html: string): string {
  // Genius renders lyrics inside data-lyrics-container divs (as of 2024)
  // We extract text from those containers, stripping all HTML tags.
  const containerRegex =
    /data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi;

  const parts: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = containerRegex.exec(html)) !== null) {
    parts.push(match[1]);
  }

  if (parts.length === 0) {
    // Fallback: try the older Genius lyrics__content class
    const legacyRegex = /class="lyrics"[^>]*>([\s\S]*?)<\/div>/i;
    const legacyMatch = legacyRegex.exec(html);
    if (legacyMatch) parts.push(legacyMatch[1]);
  }

  return parts
    .join('\n')
    .replace(/<br\s*\/?>/gi, '\n')   // <br> → newline
    .replace(/<[^>]+>/g, '')          // strip remaining tags
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/\n{3,}/g, '\n\n')       // collapse excessive blank lines
    .trim();
}
