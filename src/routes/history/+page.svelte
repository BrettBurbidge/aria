<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  import type { PageData } from './$types.js';
  import type { MoodParams } from '$lib/types.js';

  export let data: PageData;

  interface SessionRow {
    id: string;
    mood_input: string;
    parsed_params: MoodParams;
    created_at: string;
    generated_playlists: {
      id: string;
      spotify_playlist_id: string | null;
      created_at: string;
    }[];
  }

  // If no uid in URL, redirect to home.
  onMount(() => {
    if (!$page.url.searchParams.get('uid')) {
      goto('/');
    }
  });

  $: sessions = (data.sessions ?? []) as SessionRow[];

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function truncate(str: string, max = 80): string {
    return str.length > max ? str.slice(0, max).trimEnd() + '…' : str;
  }
</script>

<svelte:head>
  <title>History — Aria</title>
</svelte:head>

<main>
  <div class="container">
    <nav class="back-nav">
      <button class="back-btn" on:click={() => goto('/')}>← Back</button>
    </nav>

    <header>
      <h1>Your Playlist History</h1>
      <p class="subtitle">All the moods you've explored.</p>
    </header>

    {#if sessions.length === 0}
      <div class="empty-state">
        <p>No sessions yet. Go describe your mood!</p>
        <button class="btn btn--primary" on:click={() => goto('/')}>
          Get Started
        </button>
      </div>
    {:else}
      <ol class="session-list" aria-label="Mood session history">
        {#each sessions as session (session.id)}
          {@const playlist = session.generated_playlists?.[0] ?? null}
          <li class="session-card">
            <a class="session-link" href="/playlist/{session.id}">
              <div class="session-top">
                <span class="mood-label">
                  {session.parsed_params?.mood_label ?? 'mood'}
                </span>
                <span class="session-date">{formatDate(session.created_at)}</span>
              </div>

              <p class="session-input">"{truncate(session.mood_input)}"</p>

              <div class="session-bottom">
                <span class="playlist-name">
                  {session.parsed_params?.playlist_name ?? 'Untitled Playlist'}
                </span>
                {#if playlist?.spotify_playlist_id}
                  <span class="saved-badge">Saved to Spotify</span>
                {/if}
              </div>
            </a>
          </li>
        {/each}
      </ol>
    {/if}
  </div>
</main>

<style>
  :root {
    --bg: #0d0d0f;
    --surface: #18181b;
    --surface-raised: #222226;
    --border: #2e2e35;
    --text: #f4f4f5;
    --text-muted: #a1a1aa;
    --accent: #1db954;
    --danger: #ef4444;
    --radius: 12px;
    --font: 'Inter', system-ui, sans-serif;
  }

  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(body) {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  main { padding: 2rem 1rem 4rem; }

  .container {
    max-width: 720px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .back-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.9rem;
    padding: 0;
    transition: color 0.15s;
  }
  .back-btn:hover { color: var(--text); }

  h1 {
    font-size: 1.8rem;
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  .subtitle { color: var(--text-muted); font-size: 0.95rem; }

  .empty-state {
    text-align: center;
    padding: 3rem 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    color: var(--text-muted);
  }

  .btn--primary {
    background: linear-gradient(135deg, #7c3aed, var(--accent));
    color: #fff;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 9999px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
    text-decoration: none;
  }
  .btn--primary:hover { opacity: 0.9; transform: translateY(-1px); }

  .session-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .session-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    transition: background 0.15s, border-color 0.15s;
  }

  .session-card:hover {
    background: var(--surface-raised);
    border-color: #3e3e46;
  }

  .session-link {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1.1rem 1.25rem;
    text-decoration: none;
    color: inherit;
  }

  .session-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .mood-label {
    background: rgba(124, 58, 237, 0.2);
    border: 1px solid rgba(124, 58, 237, 0.4);
    color: #a78bfa;
    border-radius: 9999px;
    padding: 0.15rem 0.6rem;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .session-date {
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  .session-input {
    color: var(--text-muted);
    font-style: italic;
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .session-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .playlist-name {
    font-weight: 600;
    font-size: 0.95rem;
  }

  .saved-badge {
    background: rgba(29, 185, 84, 0.15);
    border: 1px solid rgba(29, 185, 84, 0.35);
    color: var(--accent);
    border-radius: 9999px;
    padding: 0.15rem 0.6rem;
    font-size: 0.72rem;
    font-weight: 600;
  }
</style>
