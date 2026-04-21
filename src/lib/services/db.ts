import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { DATABASE_URL } from '$env/static/private';
import type { MoodParams, RankedTrack, SpotifyTokens } from '$lib/types.js';

// ── Singleton ─────────────────────────────────────────────────────────────────
// Prisma 7 requires a driver adapter — the binary engine is removed.
// PrismaPg connects to Supabase Postgres via the pg driver.
// The hot-reload guard prevents exhausting connections in development.

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaPg(DATABASE_URL);
  return new PrismaClient({ adapter, log: ['error', 'warn'] });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// ── User helpers ──────────────────────────────────────────────────────────────

export async function getUserBySpotifyId(spotifyId: string) {
  return prisma.user.findUnique({ where: { spotify_id: spotifyId } });
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export async function upsertUser(payload: {
  spotify_id: string;
  display_name?: string | null;
  email?: string | null;
  image_url?: string | null;
}) {
  return prisma.user.upsert({
    where: { spotify_id: payload.spotify_id },
    update: {
      display_name: payload.display_name,
      email: payload.email,
      image_url: payload.image_url
    },
    create: {
      spotify_id: payload.spotify_id,
      display_name: payload.display_name,
      email: payload.email,
      image_url: payload.image_url
    }
  });
}

// ── Token helpers ─────────────────────────────────────────────────────────────

export async function saveTokens(userId: string, tokens: SpotifyTokens) {
  await prisma.spotifyToken.upsert({
    where: { user_id: userId },
    update: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(tokens.expires_at)
    },
    create: {
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(tokens.expires_at)
    }
  });
}

export async function getTokens(userId: string): Promise<SpotifyTokens | null> {
  const row = await prisma.spotifyToken.findUnique({ where: { user_id: userId } });
  if (!row) return null;

  return {
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expires_at: row.expires_at.toISOString()
  };
}

// ── Mood session helpers ──────────────────────────────────────────────────────

export async function saveMoodSession(payload: {
  user_id: string;
  mood_input: string;
  parsed_params: MoodParams;
}) {
  return prisma.moodSession.create({
    data: {
      user_id: payload.user_id,
      mood_input: payload.mood_input,
      parsed_params: payload.parsed_params as object
    }
  });
}

export async function getMoodSession(sessionId: string) {
  return prisma.moodSession.findUnique({
    where: { id: sessionId },
    include: { generated_playlists: true }
  });
}

export async function getMoodSessionsByUser(userId: string) {
  return prisma.moodSession.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    include: {
      generated_playlists: {
        select: { id: true, spotify_playlist_id: true, created_at: true }
      }
    }
  });
}

// ── Playlist helpers ──────────────────────────────────────────────────────────

export async function saveGeneratedPlaylist(payload: {
  session_id: string;
  spotify_playlist_id: string;
  tracks: RankedTrack[];
}) {
  return prisma.generatedPlaylist.create({
    data: {
      session_id: payload.session_id,
      spotify_playlist_id: payload.spotify_playlist_id,
      tracks: payload.tracks as object[]
    }
  });
}

export async function getGeneratedPlaylist(sessionId: string) {
  return prisma.generatedPlaylist.findFirst({
    where: { session_id: sessionId }
  });
}

// ── Cached track helpers ──────────────────────────────────────────────────────

export async function getCachedTrack(spotifyId: string) {
  return prisma.cachedTrack.findUnique({ where: { spotify_id: spotifyId } });
}

export async function upsertCachedTrack(payload: {
  spotify_id: string;
  name: string;
  artist: string;
  audio_features?: object;
  lastfm_tags?: object;
}) {
  await prisma.cachedTrack.upsert({
    where: { spotify_id: payload.spotify_id },
    update: {
      audio_features: payload.audio_features,
      lastfm_tags: payload.lastfm_tags,
      cached_at: new Date()
    },
    create: {
      spotify_id: payload.spotify_id,
      name: payload.name,
      artist: payload.artist,
      audio_features: payload.audio_features,
      lastfm_tags: payload.lastfm_tags
    }
  });
}
