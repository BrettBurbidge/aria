import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { buildMoodParserPrompt, buildRankerPrompt } from '$lib/prompts.js';
import type { MoodParams, RankedTrack, Track } from '$lib/types.js';

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2048;

// ── Default fallbacks ─────────────────────────────────────────────────────────

const DEFAULT_MOOD_PARAMS: MoodParams = {
  valence: 0.5,
  energy: 0.5,
  tempo: 120,
  genres: ['pop', 'indie'],
  keywords: ['neutral', 'balanced'],
  mood_label: 'neutral',
  playlist_name: 'My Aria Playlist'
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Strips markdown code fences if Claude wraps its JSON in them despite
 * instructions. Handles ```json … ``` and plain ``` … ```.
 */
function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Uses Claude to parse a free-form mood description into structured MoodParams.
 * Returns DEFAULT_MOOD_PARAMS on any failure so the rest of the pipeline can
 * continue gracefully.
 */
export async function parseMood(moodInput: string): Promise<MoodParams> {
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: buildMoodParserPrompt(moodInput)
        }
      ]
    });

    const rawText =
      response.content[0]?.type === 'text' ? response.content[0].text : '';
    const cleaned = stripFences(rawText);
    const parsed = JSON.parse(cleaned) as Partial<MoodParams>;

    // Validate and clamp numeric fields
    return {
      valence: clamp(Number(parsed.valence ?? DEFAULT_MOOD_PARAMS.valence), 0, 1),
      energy: clamp(Number(parsed.energy ?? DEFAULT_MOOD_PARAMS.energy), 0, 1),
      tempo: Math.round(Number(parsed.tempo ?? DEFAULT_MOOD_PARAMS.tempo)),
      genres: Array.isArray(parsed.genres) && parsed.genres.length > 0
        ? parsed.genres.slice(0, 5)
        : DEFAULT_MOOD_PARAMS.genres,
      keywords: Array.isArray(parsed.keywords) && parsed.keywords.length > 0
        ? parsed.keywords.slice(0, 6)
        : DEFAULT_MOOD_PARAMS.keywords,
      mood_label: typeof parsed.mood_label === 'string' && parsed.mood_label
        ? parsed.mood_label
        : DEFAULT_MOOD_PARAMS.mood_label,
      playlist_name: typeof parsed.playlist_name === 'string' && parsed.playlist_name
        ? parsed.playlist_name
        : DEFAULT_MOOD_PARAMS.playlist_name
    };
  } catch (err) {
    console.error('parseMood failed, using defaults:', err);
    return DEFAULT_MOOD_PARAMS;
  }
}

/**
 * Uses Claude to rank candidate tracks against the desired mood parameters.
 * Falls back to the original order with a default score on any failure.
 */
export async function rankTracks(
  candidates: Track[],
  moodParams: MoodParams
): Promise<RankedTrack[]> {
  if (candidates.length === 0) return [];

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: buildRankerPrompt(candidates, moodParams)
        }
      ]
    });

    const rawText =
      response.content[0]?.type === 'text' ? response.content[0].text : '[]';
    const cleaned = stripFences(rawText);
    const ranked = JSON.parse(cleaned) as Array<{
      spotify_id: string;
      rank_score: number;
      rank_reason: string;
    }>;

    if (!Array.isArray(ranked)) throw new Error('Claude did not return an array');

    // Build a lookup map from the scored results
    const scoreMap = new Map(
      ranked.map((r) => [
        r.spotify_id,
        { rank_score: Number(r.rank_score), rank_reason: String(r.rank_reason) }
      ])
    );

    // Merge scores back onto the original track objects, keep only scored tracks
    const result: RankedTrack[] = candidates
      .filter((t) => scoreMap.has(t.spotify_id))
      .map((t) => {
        const score = scoreMap.get(t.spotify_id)!;
        return {
          ...t,
          rank_score: clamp(score.rank_score, 0, 100),
          rank_reason: score.rank_reason
        };
      })
      .sort((a, b) => b.rank_score - a.rank_score);

    // If Claude returned valid JSON but didn't score any of our candidates
    // (ID mismatch or empty array), fall back rather than silently returning nothing.
    if (result.length === 0 && candidates.length > 0) {
      console.warn('rankTracks: Claude returned 0 matching tracks, falling back. scoreMap size:', scoreMap.size);
      return candidates.map((t, i) => ({
        ...t,
        rank_score: Math.max(0, 50 - i),
        rank_reason: 'Automatically matched based on mood profile.'
      }));
    }

    return result;
  } catch (err) {
    console.error('rankTracks failed, falling back to original order:', err);

    // Graceful fallback: return candidates in original order with a mid score
    return candidates.map((t, i) => ({
      ...t,
      rank_score: Math.max(0, 50 - i),
      rank_reason: 'Automatically matched based on audio features.'
    }));
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
