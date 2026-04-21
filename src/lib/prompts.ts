import type { MoodParams, Track } from './types.js';

/**
 * Builds the system+user prompt for Claude to parse a freeform mood description
 * into structured MoodParams JSON.
 */
export function buildMoodParserPrompt(moodInput: string): string {
  return `You are a music mood analysis engine. Your sole task is to read the user's mood description and output a single valid JSON object — no markdown fences, no explanation, no extra text.

The JSON object must contain exactly these fields:
- "valence": float 0.0–1.0 (0 = very sad/negative, 1 = very happy/positive)
- "energy": float 0.0–1.0 (0 = calm/quiet, 1 = intense/high-energy)
- "tempo": integer BPM (e.g. 60–200)
- "genres": array of 3–5 valid Spotify genre seed strings (e.g. "pop", "indie", "chill", "electronic", "hip-hop")
- "keywords": array of 3–6 single descriptive words that capture the mood (e.g. "melancholic", "dreamy", "uplifting")
- "mood_label": a single evocative word summarising the overall mood (e.g. "melancholic", "euphoric", "serene")
- "playlist_name": a creative, short playlist name (5 words or fewer) that fits the mood

Mood description: ${moodInput}`;
}

/**
 * Builds the prompt for Claude to rank a pool of candidate tracks against the
 * desired mood parameters and return a scored JSON array.
 */
export function buildRankerPrompt(candidates: Track[], moodParams: MoodParams): string {
  const trackList = candidates
    .map((t, i) => {
      const af = t.audio_features;
      const tags = t.lastfm_tags?.join(', ') ?? 'none';
      const sentiment =
        t.lyric_sentiment !== undefined ? t.lyric_sentiment.toFixed(2) : 'n/a';

      return [
        `[${i + 1}] spotify_id: ${t.spotify_id}`,
        `    title: "${t.name}" by ${t.artist}`,
        `    audio: valence=${af?.valence ?? 'n/a'}, energy=${af?.energy ?? 'n/a'}, tempo=${af?.tempo ?? 'n/a'} BPM, danceability=${af?.danceability ?? 'n/a'}`,
        `    lastfm tags: ${tags}`,
        `    lyric sentiment: ${sentiment}`
      ].join('\n');
    })
    .join('\n\n');

  return `You are a music curation expert. Select the 15–20 tracks from the candidate list below that best match the target mood profile, then score each selected track 0–100.

Target mood profile:
- mood label: ${moodParams.mood_label}
- valence target: ${moodParams.valence}
- energy target: ${moodParams.energy}
- tempo target: ${moodParams.tempo} BPM
- genres: ${moodParams.genres.join(', ')}
- keywords: ${moodParams.keywords.join(', ')}

Candidate tracks:
${trackList}

Return ONLY a valid JSON array. Each element must be an object with exactly these fields:
- "spotify_id": string (copy from the candidate)
- "rank_score": integer 0–100
- "rank_reason": string (one concise sentence explaining why this track fits)

No markdown, no explanation, no extra text — just the JSON array.`;
}
