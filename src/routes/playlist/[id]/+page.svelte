<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types.js';
  import type { RankedTrack } from '$lib/types.js';

  export let data: PageData;

  // `data.user` comes from the root layout server load (merged automatically by SvelteKit)
  $: userId = (data as any).user?.id ?? null;

  let tracks: RankedTrack[] = data.playlist?.tracks ?? [];
  let playlistName = data.session.parsed_params?.playlist_name ?? 'My Playlist';
  let spotifyPlaylistId = data.playlist?.spotify_playlist_id ?? null;

  let saving = false;
  let saveError = '';
  let expanding = false;
  let expandError = '';

  onMount(() => {
    if (tracks.length === 0) {
      const cached = sessionStorage.getItem(`aria_tracks_${data.session.id}`);
      if (cached) {
        try { tracks = JSON.parse(cached) as RankedTrack[]; } catch { /* ignore */ }
      }
    }
  });

  // ── Drag-to-reorder ───────────────────────────────────────────────────────
  let dragIndex: number | null = null;
  let dragOverIndex: number | null = null;

  function onDragStart(i: number) {
    dragIndex = i;
  }

  function onDragOver(e: DragEvent, i: number) {
    e.preventDefault();
    dragOverIndex = i;
  }

  function onDrop(i: number) {
    if (dragIndex === null || dragIndex === i) { reset(); return; }
    const updated = [...tracks];
    const [moved] = updated.splice(dragIndex, 1);
    updated.splice(i, 0, moved);
    tracks = updated;
    reset();
  }

  function onDragEnd() { reset(); }

  function reset() { dragIndex = null; dragOverIndex = null; }

  function moveTrack(from: number, dir: -1 | 1) {
    const to = from + dir;
    if (to < 0 || to >= tracks.length) return;
    const updated = [...tracks];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);
    tracks = updated;
  }

  function removeTrack(i: number) {
    tracks = tracks.filter((_, idx) => idx !== i);
  }

  // ── Add more tracks ───────────────────────────────────────────────────────
  async function addMore() {
    if (!userId) return;
    expanding = true;
    expandError = '';
    try {
      const res = await fetch('/api/mood/expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: data.session.id,
          user_id: userId,
          exclude_ids: tracks.map((t) => t.spotify_id)
        })
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.message ?? `Error ${res.status}`);
      }
      const result = await res.json();
      if (result.tracks.length === 0) {
        expandError = 'No new tracks found — try again for different results.';
      } else {
        tracks = [...tracks, ...result.tracks];
      }
    } catch (err) {
      expandError = err instanceof Error ? err.message : 'Failed to fetch more tracks.';
    } finally {
      expanding = false;
    }
  }

  // ── Create playlist ───────────────────────────────────────────────────────
  async function createPlaylist() {
    if (!userId) { saveError = 'You must be logged in to create a playlist.'; return; }

    saving = true;
    saveError = '';

    try {
      const res = await fetch('/api/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: data.session.id,
          user_id: userId,
          tracks,
          playlist_name: playlistName
        })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Error ${res.status}`);
      }

      const result = await res.json();
      spotifyPlaylistId = result.playlist_id;
      window.open(result.spotify_url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      saveError = err instanceof Error ? err.message : 'Failed to create playlist.';
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>{playlistName} — Aria</title>
</svelte:head>

<main>
  <div class="container">
    <nav class="back-nav">
      <button class="back-btn" on:click={() => goto('/')}>← Back</button>
    </nav>

    <header class="playlist-header">
      <div class="mood-badge">{data.session.parsed_params?.mood_label ?? 'mood'}</div>
      <h1 class="playlist-name">{playlistName}</h1>
      <p class="mood-snippet">"{data.session.mood_input}"</p>
    </header>

    {#if tracks.length === 0}
      <div class="empty-state">
        <p>No tracks found. Try going back and submitting a new mood.</p>
        <button class="btn btn--secondary" on:click={() => goto('/')}>Try Again</button>
      </div>
    {:else}
      <div class="list-header">
        <span class="track-count">{tracks.length} tracks · drag to reorder</span>

        <div class="actions">
          <button
            class="btn btn--secondary"
            on:click={addMore}
            disabled={expanding}
          >
            {#if expanding}
              <span class="spinner spinner--dark" aria-hidden="true"></span>
              Finding more…
            {:else}
              + Add More
            {/if}
          </button>
          {#if spotifyPlaylistId}
            <a
              href="https://open.spotify.com/playlist/{spotifyPlaylistId}"
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn--spotify"
            >
              Open in Spotify
            </a>
          {:else}
            <button
              class="btn btn--spotify"
              on:click={createPlaylist}
              disabled={saving || tracks.length === 0}
            >
              {#if saving}
                <span class="spinner" aria-hidden="true"></span>
                Creating…
              {:else}
                <svg class="spotify-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.441 17.307a.748.748 0 0 1-1.03.244c-2.819-1.723-6.365-2.112-10.542-1.157a.748.748 0 1 1-.333-1.459c4.573-1.045 8.492-.596 11.661 1.342a.748.748 0 0 1 .244 1.03zm1.452-3.23a.936.936 0 0 1-1.288.308c-3.225-1.983-8.144-2.558-11.963-1.4a.937.937 0 0 1-.573-1.786c4.361-1.323 9.78-.682 13.516 1.59a.936.936 0 0 1 .308 1.288zm.124-3.36C15.24 8.41 8.802 8.202 5.258 9.266a1.124 1.124 0 1 1-.652-2.149c4.109-1.245 10.942-1.005 15.255 1.585a1.124 1.124 0 0 1-1.844 1.015z"/>
                </svg>
                Create Playlist
              {/if}
            </button>
          {/if}
        </div>
      </div>

      {#if saveError}
        <p class="error-msg" role="alert">{saveError}</p>
      {/if}
      {#if expandError}
        <p class="error-msg" role="alert">{expandError}</p>
      {/if}

      <ol class="track-list" aria-label="Playlist tracks">
        {#each tracks as track, i (track.spotify_id)}
          <li
            class="track-card"
            class:drag-over={dragOverIndex === i && dragIndex !== i}
            class:dragging={dragIndex === i}
            draggable="true"
            on:dragstart={() => onDragStart(i)}
            on:dragover={(e) => onDragOver(e, i)}
            on:drop={() => onDrop(i)}
            on:dragend={onDragEnd}
            role="listitem"
          >
            <span class="drag-handle" aria-hidden="true">⠿</span>
            <span class="track-number">{i + 1}</span>

            {#if track.image_url}
              <img
                class="album-art"
                src={track.image_url}
                alt="Album art for {track.album}"
                loading="lazy"
                width="52"
                height="52"
              />
            {:else}
              <div class="album-art album-art--placeholder" aria-hidden="true">♫</div>
            {/if}

            <div class="track-info">
              <span class="track-name">{track.name}</span>
              <span class="track-artist">{track.artist}</span>
              {#if track.rank_reason}
                <span class="track-reason">{track.rank_reason}</span>
              {/if}
            </div>

            <div class="track-meta">
              {#if track.preview_url}
                <audio controls preload="none" class="preview-audio" aria-label="Preview {track.name}">
                  <source src={track.preview_url} type="audio/mpeg" />
                </audio>
              {/if}
              <div class="reorder-btns">
                <button class="icon-btn" on:click={() => moveTrack(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">▲</button>
                <button class="icon-btn" on:click={() => moveTrack(i, 1)} disabled={i === tracks.length - 1} aria-label="Move down" title="Move down">▼</button>
                <button class="icon-btn icon-btn--remove" on:click={() => removeTrack(i)} aria-label="Remove track" title="Remove">✕</button>
              </div>
            </div>
          </li>
        {/each}
      </ol>

      <div class="footer-actions">
        {#if spotifyPlaylistId}
          <a
            href="https://open.spotify.com/playlist/{spotifyPlaylistId}"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn--spotify btn--full"
          >
            Open in Spotify
          </a>
        {:else}
          <button
            class="btn btn--spotify btn--full"
            on:click={createPlaylist}
            disabled={saving || tracks.length === 0}
          >
            {#if saving}
              <span class="spinner" aria-hidden="true"></span>
              Creating…
            {:else}
              <svg class="spotify-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.441 17.307a.748.748 0 0 1-1.03.244c-2.819-1.723-6.365-2.112-10.542-1.157a.748.748 0 1 1-.333-1.459c4.573-1.045 8.492-.596 11.661 1.342a.748.748 0 0 1 .244 1.03zm1.452-3.23a.936.936 0 0 1-1.288.308c-3.225-1.983-8.144-2.558-11.963-1.4a.937.937 0 0 1-.573-1.786c4.361-1.323 9.78-.682 13.516 1.59a.936.936 0 0 1 .308 1.288zm.124-3.36C15.24 8.41 8.802 8.202 5.258 9.266a1.124 1.124 0 1 1-.652-2.149c4.109-1.245 10.942-1.005 15.255 1.585a1.124 1.124 0 0 1-1.844 1.015z"/>
              </svg>
              Create Playlist
            {/if}
          </button>
        {/if}
      </div>
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
    --accent-hover: #1ed760;
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

  .playlist-header {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .mood-badge {
    display: inline-block;
    background: rgba(124, 58, 237, 0.2);
    border: 1px solid rgba(124, 58, 237, 0.4);
    color: #a78bfa;
    border-radius: 9999px;
    padding: 0.25rem 0.75rem;
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    width: fit-content;
  }

  .playlist-name {
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  .mood-snippet {
    color: var(--text-muted);
    font-style: italic;
    font-size: 0.95rem;
  }

  /* ── List header ── */
  .list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .track-count {
    color: var(--text-muted);
    font-size: 0.83rem;
  }

  .actions { display: flex; gap: 0.75rem; }

  /* ── Buttons ── */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.65rem 1.25rem;
    border-radius: 9999px;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: background 0.15s, transform 0.1s, opacity 0.15s;
    text-decoration: none;
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn:not(:disabled):hover { transform: translateY(-1px); }
  .btn--spotify { background: var(--accent); color: #000; }
  .btn--spotify:not(:disabled):hover { background: var(--accent-hover); }
  .btn--secondary { background: var(--surface-raised); color: var(--text); border: 1px solid var(--border); }
  .btn--full { width: 100%; border-radius: var(--radius); padding: 0.9rem 1.5rem; font-size: 1rem; }

  .spotify-icon { width: 1.1rem; height: 1.1rem; }

  .error-msg { color: var(--danger); font-size: 0.875rem; }

  /* ── Track list ── */
  .track-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .track-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.75rem 0.875rem;
    transition: background 0.15s, border-color 0.15s, opacity 0.15s;
    cursor: grab;
    user-select: none;
  }
  .track-card:hover { background: var(--surface-raised); }
  .track-card.drag-over { border-color: var(--accent); background: rgba(29, 185, 84, 0.06); }
  .track-card.dragging { opacity: 0.4; }

  .drag-handle {
    color: var(--border);
    font-size: 1rem;
    flex-shrink: 0;
    cursor: grab;
    line-height: 1;
  }

  .track-number {
    color: var(--text-muted);
    font-size: 0.78rem;
    min-width: 1.25rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .album-art {
    width: 52px;
    height: 52px;
    border-radius: 8px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .album-art--placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-raised);
    color: var(--text-muted);
    font-size: 1.3rem;
  }

  .track-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .track-name {
    font-weight: 600;
    font-size: 0.92rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .track-artist {
    color: var(--text-muted);
    font-size: 0.82rem;
  }

  .track-reason {
    color: var(--text-muted);
    font-size: 0.75rem;
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .track-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.35rem;
    flex-shrink: 0;
  }

  .preview-audio {
    height: 26px;
    width: 130px;
    accent-color: var(--accent);
  }

  .reorder-btns {
    display: flex;
    gap: 0.25rem;
  }

  .icon-btn {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.6rem;
    width: 1.6rem;
    height: 1.6rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
    flex-shrink: 0;
  }
  .icon-btn:not(:disabled):hover { background: var(--surface-raised); color: var(--text); border-color: #555; }
  .icon-btn:disabled { opacity: 0.25; cursor: not-allowed; }
  .icon-btn--remove:not(:disabled):hover { color: var(--danger); border-color: rgba(239,68,68,0.4); background: rgba(239,68,68,0.08); }

  /* ── Footer ── */
  .footer-actions { margin-top: 0.5rem; }

  /* ── Empty state ── */
  .empty-state {
    text-align: center;
    padding: 3rem 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: center;
    color: var(--text-muted);
  }

  .spinner {
    display: inline-block;
    width: 0.85rem;
    height: 0.85rem;
    border: 2px solid rgba(0,0,0,0.3);
    border-top-color: #000;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .spinner--dark {
    border-color: rgba(255,255,255,0.2);
    border-top-color: var(--text);
  }
</style>
