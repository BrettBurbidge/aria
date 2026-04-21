import { getUserById } from '$lib/services/db.js';
import type { LayoutServerLoad } from './$types.js';
import type { SpotifyUser } from '$lib/types.js';

export const load: LayoutServerLoad = async ({ cookies }) => {
  const uid = cookies.get('aria_uid');
  if (!uid) return { user: null };

  try {
    const row = await getUserById(uid);
    if (!row) {
      return { user: null };
    }

    const user: SpotifyUser = {
      id: row.id,
      spotify_id: row.spotify_id,
      display_name: row.display_name ?? null,
      email: row.email ?? null,
      image_url: row.image_url ?? null
    };

    return { user };
  } catch (err) {
    console.error('Failed to load session user:', err);
    return { user: null };
  }
};
