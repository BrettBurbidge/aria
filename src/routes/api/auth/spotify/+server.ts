import { redirect } from '@sveltejs/kit';
import { SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI } from '$env/static/private';
import type { RequestHandler } from './$types.js';

const SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-modify-public',
  'playlist-modify-private'
].join(' ');

/** Cryptographically random hex string for CSRF state parameter. */
function generateState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const GET: RequestHandler = ({ cookies }) => {
  const state = generateState();

  // Store state in a short-lived httpOnly cookie so the callback can verify it.
  cookies.set('spotify_oauth_state', state, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes — plenty of time to complete the OAuth flow
    secure: process.env.NODE_ENV === 'production'
  });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    state,
    show_dialog: 'true' // always show the account chooser so the user sees who they're logging in as
  });

  redirect(302, `https://accounts.spotify.com/authorize?${params.toString()}`);
};
