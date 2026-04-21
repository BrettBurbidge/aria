import { error } from '@sveltejs/kit';
import { getMoodSession } from '$lib/services/db.js';
import type { PageServerLoad } from './$types.js';
import type { MoodParams, RankedTrack } from '$lib/types.js';

export const load: PageServerLoad = async ({ params }) => {
  const session = await getMoodSession(params.id);

  if (!session) {
    error(404, 'Mood session not found.');
  }

  const playlist = session.generated_playlists[0] ?? null;

  return {
    session: {
      id: session.id,
      user_id: session.user_id,
      mood_input: session.mood_input,
      parsed_params: session.parsed_params as MoodParams,
      created_at: session.created_at.toISOString()
    },
    playlist: playlist
      ? {
          id: playlist.id,
          session_id: playlist.session_id,
          spotify_playlist_id: playlist.spotify_playlist_id ?? '',
          tracks: playlist.tracks as RankedTrack[],
          created_at: playlist.created_at.toISOString()
        }
      : null
  };
};
