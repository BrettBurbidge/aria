<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import type { LayoutData } from './$types.js';

  export let data: LayoutData;

  $: user = data.user;
  $: authStatus = $page.url.searchParams.get('auth');

  let mood = '';
  let loading = false;
  let errorMessage = '';

  async function handleSubmit() {
    if (!mood.trim() || !user) return;

    loading = true;
    errorMessage = '';

    try {
      const res = await fetch('/api/mood', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mood: mood.trim(), userId: user.id })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Server error ${res.status}`);
      }

      const result = await res.json();
      // Cache tracks in sessionStorage so the playlist page can display them immediately
      sessionStorage.setItem(`aria_tracks_${result.session_id}`, JSON.stringify(result.tracks));
      goto(`/playlist/${result.session_id}`);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Something went wrong.';
    } finally {
      loading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit();
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    // Full page reload so the layout server re-runs and clears user state.
    window.location.href = '/';
  }


</script>

<svelte:head>
  <title>Aria — Your AI Mood DJ</title>
</svelte:head>

<main>
  <div class="container">

    <!-- ── Header ── -->
    <header>
      <div class="logo">
        <span class="logo-icon">♫</span>
        <h1>Aria</h1>
      </div>
      <p class="tagline">Share your mood. We we'll build the perfect soundtrack.</p>
    </header>

    <!-- ── Auth status banners ── -->
    {#if authStatus === 'success'}
      <div class="banner banner--success" role="status">
        Spotify connected! You're all set.
      </div>
    {:else if authStatus === 'denied'}
      <div class="banner banner--warning" role="status">
        Spotify connection cancelled.
      </div>
    {:else if authStatus === 'error'}
      <div class="banner banner--error" role="status">
        Something went wrong connecting to Spotify. Please try again.
      </div>
    {/if}

    <!-- ── Logged-in user profile card ── -->
    {#if user}
      <div class="profile-card">
        <div class="profile-left">
          {#if user.image_url}
            <img
              src={user.image_url}
              alt="{user.display_name ?? 'User'}'s Spotify avatar"
              class="avatar"
            />
          {:else}
            <div class="avatar avatar--placeholder" aria-hidden="true">
              {(user.display_name ?? user.spotify_id)[0].toUpperCase()}
            </div>
          {/if}
          <div class="profile-info">
            <span class="profile-name">{user.display_name ?? user.spotify_id}</span>
            <span class="profile-sub">Connected via Spotify</span>
          </div>
        </div>
        <div class="profile-right">
          <a href="/history?uid={user.id}" class="btn btn--ghost">History</a>
          <button class="btn btn--ghost btn--logout" on:click={handleLogout}>
            Log out
          </button>
        </div>
      </div>
    {:else}
      <!-- ── Connect prompt ── -->
      <section class="connect-section">
        <p class="connect-prompt">Connect your Spotify account to get started.</p>
        <a href="/api/auth/spotify" class="btn btn--spotify">
          <svg class="spotify-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.441 17.307a.748.748 0 0 1-1.03.244c-2.819-1.723-6.365-2.112-10.542-1.157a.748.748 0 1 1-.333-1.459c4.573-1.045 8.492-.596 11.661 1.342a.748.748 0 0 1 .244 1.03zm1.452-3.23a.936.936 0 0 1-1.288.308c-3.225-1.983-8.144-2.558-11.963-1.4a.937.937 0 0 1-.573-1.786c4.361-1.323 9.78-.682 13.516 1.59a.936.936 0 0 1 .308 1.288zm.124-3.36C15.24 8.41 8.802 8.202 5.258 9.266a1.124 1.124 0 1 1-.652-2.149c4.109-1.245 10.942-1.005 15.255 1.585a1.124 1.124 0 0 1-1.844 1.015z"/>
          </svg>
          Connect with Spotify
        </a>
      </section>
    {/if}

    <!-- ── Mood input ── -->
    <section class="mood-section" class:disabled={!user}>
      <form on:submit|preventDefault={handleSubmit}>
        <label for="mood-input" class="sr-only">Describe your mood</label>
        <textarea
          id="mood-input"
          bind:value={mood}
          on:keydown={handleKeydown}
          placeholder={user ? "Describe how you're feeling…" : "Connect Spotify to get started"}
          rows="5"
          disabled={!user || loading}
          maxlength="500"
        ></textarea>

        <div class="form-footer">
          <span class="char-count" aria-live="polite">{mood.length}/500</span>
          <button
            type="submit"
            class="btn btn--primary"
            disabled={!user || loading || !mood.trim()}
          >
            {#if loading}
              <span class="spinner" aria-hidden="true"></span>
              Generating playlist…
            {:else}
              Generate Playlist
            {/if}
          </button>
        </div>
      </form>
      {#if user}
        <p class="hint">Tip: press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to submit.</p>
      {/if}
    </section>

    {#if errorMessage}
      <div class="banner banner--error" role="alert">{errorMessage}</div>
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
    --warning: #f59e0b;
    --success: #22c55e;
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

  main {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
  }

  .container {
    width: 100%;
    max-width: 640px;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* ── Header ── */
  header { text-align: center; }

  .logo {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .logo-icon { font-size: 2rem; color: var(--accent); }

  h1 {
    font-size: 2.5rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    background: linear-gradient(135deg, var(--accent) 0%, #7c3aed 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .tagline { color: var(--text-muted); font-size: 1.05rem; }

  /* ── Banners ── */
  .banner {
    padding: 0.875rem 1.25rem;
    border-radius: var(--radius);
    font-size: 0.9rem;
    font-weight: 500;
  }

  .banner--success {
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(34, 197, 94, 0.35);
    color: var(--success);
  }

  .banner--warning {
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.35);
    color: var(--warning);
  }

  .banner--error {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.35);
    color: var(--danger);
  }

  /* ── Profile card ── */
  .profile-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem 1.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .profile-left {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    min-width: 0;
  }

  .avatar {
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    border: 2px solid var(--accent);
  }

  .avatar--placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #7c3aed, var(--accent));
    color: #fff;
    font-size: 1.1rem;
    font-weight: 700;
  }

  .profile-info {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .profile-name {
    font-weight: 600;
    font-size: 0.95rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .profile-sub {
    font-size: 0.78rem;
    color: var(--accent);
  }

  .profile-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  /* ── Connect section ── */
  .connect-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 2rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    align-items: center;
  }

  .connect-prompt { color: var(--text-muted); }

  /* ── Buttons ── */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    border-radius: 9999px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: background 0.15s, transform 0.1s, opacity 0.15s;
    text-decoration: none;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
  }

  .btn:not(:disabled):hover { transform: translateY(-1px); }

  .btn--spotify { background: var(--accent); color: #000; }
  .btn--spotify:not(:disabled):hover { background: var(--accent-hover); }

  .btn--ghost {
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
    padding: 0.45rem 0.9rem;
    font-size: 0.82rem;
  }

  .btn--ghost:not(:disabled):hover {
    background: var(--surface-raised);
    color: var(--text);
    transform: none;
  }

  .btn--logout { color: var(--danger); border-color: rgba(239, 68, 68, 0.3); }
  .btn--logout:not(:disabled):hover {
    background: rgba(239, 68, 68, 0.1);
    color: var(--danger);
  }

  .btn--primary {
    background: linear-gradient(135deg, #7c3aed, var(--accent));
    color: #fff;
    width: 100%;
    padding: 0.9rem 1.5rem;
    font-size: 1rem;
    border-radius: var(--radius);
  }

  .spotify-icon { width: 1.25rem; height: 1.25rem; }

  /* ── Mood input ── */
  .mood-section { display: flex; flex-direction: column; gap: 0.5rem; }

  .mood-section.disabled textarea { opacity: 0.45; cursor: not-allowed; }

  textarea {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-family: var(--font);
    font-size: 1rem;
    line-height: 1.6;
    padding: 1rem 1.25rem;
    resize: vertical;
    min-height: 140px;
    transition: border-color 0.15s;
    outline: none;
  }

  textarea::placeholder { color: var(--text-muted); }
  textarea:focus { border-color: #7c3aed; }

  .form-footer {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 0.5rem;
    flex-wrap: wrap;
  }

  .char-count {
    color: var(--text-muted);
    font-size: 0.8rem;
    white-space: nowrap;
    margin-left: auto;
    order: 1;
  }

  .btn--primary { order: 2; flex: 1; }

  .hint { color: var(--text-muted); font-size: 0.8rem; text-align: right; }

  kbd {
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.1em 0.4em;
    font-size: 0.75em;
    font-family: monospace;
  }

  .spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }


  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
