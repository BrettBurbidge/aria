import { redirect } from '@sveltejs/kit';
import { getAccessToken, getSpotifyProfile } from '$lib/services/spotify.js';
import { upsertUser, saveTokens } from '$lib/services/db.js';
import type { RequestHandler } from './$types.js';

// Session cookie lasts 30 days.
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export const GET: RequestHandler = async ({ url, cookies }) => {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  // ── 1. User denied the OAuth prompt ────────────────────────────────────────
  if (errorParam === 'access_denied') {
    redirect(302, '/?auth=denied');
  }

  if (errorParam) {
    console.error('Spotify OAuth error:', errorParam);
    redirect(302, '/?auth=error');
  }

  // ── 2. Validate CSRF state ──────────────────────────────────────────────────
  const storedState = cookies.get('spotify_oauth_state');
  cookies.delete('spotify_oauth_state', { path: '/' });

  if (!storedState || storedState !== state) {
    console.error('OAuth state mismatch — possible CSRF attempt.');
    redirect(302, '/?auth=error');
  }

  if (!code) {
    redirect(302, '/?auth=error');
  }

  // ── 3. Exchange code → tokens → profile → upsert user ──────────────────────
  try {
    const tokens = await getAccessToken(code);
    const profile = await getSpotifyProfile(tokens.access_token);

    const user = await upsertUser({
      spotify_id: profile.id,
      display_name: profile.display_name,
      email: profile.email,
      image_url: profile.image_url
    });

    await saveTokens(user.id, tokens);

    // ── 4. Set httpOnly session cookie ────────────────────────────────────────
    cookies.set('aria_uid', user.id, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      secure: process.env.NODE_ENV === 'production'
    });
  } catch (err) {
    console.error('Spotify OAuth callback failed:', err);
    redirect(302, '/?auth=error');
  }

  redirect(302, '/?auth=success');
};
