import { getMoodSessionsByUser } from '$lib/services/db.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ url }) => {
  const userId = url.searchParams.get('uid');

  if (!userId) {
    return { sessions: [] };
  }

  const rows = await getMoodSessionsByUser(userId);

  return {
    sessions: rows.map((s) => ({
      id: s.id,
      mood_input: s.mood_input,
      parsed_params: s.parsed_params,
      created_at: s.created_at.toISOString(),
      generated_playlists: s.generated_playlists.map((p) => ({
        id: p.id,
        spotify_playlist_id: p.spotify_playlist_id,
        created_at: p.created_at.toISOString()
      }))
    }))
  };
};
