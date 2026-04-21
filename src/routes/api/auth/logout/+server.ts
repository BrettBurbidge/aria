import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = ({ cookies }) => {
  cookies.delete('aria_uid', { path: '/' });
  redirect(302, '/');
};
