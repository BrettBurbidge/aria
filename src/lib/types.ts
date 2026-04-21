export interface MoodParams {
  valence: number;       // 0.0–1.0
  energy: number;        // 0.0–1.0
  tempo: number;         // BPM
  genres: string[];
  keywords: string[];
  mood_label: string;
  playlist_name: string;
}

export interface AudioFeatures {
  valence: number;
  energy: number;
  tempo: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  loudness: number;
  speechiness: number;
}

export interface Track {
  spotify_id: string;
  name: string;
  artist: string;
  album: string;
  preview_url: string | null;
  image_url: string | null;
  audio_features?: AudioFeatures;
  lastfm_tags?: string[];
  lyric_sentiment?: number;
  rank_score?: number;
  rank_reason?: string;
}

export interface RankedTrack extends Track {
  rank_score: number;
  rank_reason: string;
}

export interface MoodSession {
  id: string;
  user_id: string;
  mood_input: string;
  parsed_params: MoodParams;
  created_at: string;
}

export interface GeneratedPlaylist {
  id: string;
  session_id: string;
  spotify_playlist_id: string;
  tracks: RankedTrack[];
  created_at: string;
}

export interface SpotifyTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

export interface SpotifyUser {
  id: string;           // our DB UUID
  spotify_id: string;   // Spotify's own user ID
  display_name: string | null;
  email: string | null;
  image_url: string | null;
}
