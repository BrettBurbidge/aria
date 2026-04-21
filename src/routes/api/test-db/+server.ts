import { json } from '@sveltejs/kit';
import { prisma } from '$lib/services/db.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async () => {
  const start = Date.now();

  try {
    // Basic connectivity check
    const ping = await prisma.$queryRaw<[{ ok: number }]>`SELECT 1 AS ok`;

    // Count rows in each table to confirm schema is in place
    const [users, sessions, playlists, tokens, cachedTracks] = await Promise.all([
      prisma.user.count(),
      prisma.moodSession.count(),
      prisma.generatedPlaylist.count(),
      prisma.spotifyToken.count(),
      prisma.cachedTrack.count()
    ]);

    return json({
      ok: true,
      latency_ms: Date.now() - start,
      ping: ping[0].ok === 1,
      tables: { users, sessions, playlists, tokens, cachedTracks }
    });
  } catch (err) {
    return json(
      {
        ok: false,
        latency_ms: Date.now() - start,
        error: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
};
