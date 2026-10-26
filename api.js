// Music source: Audius (free, open, artist-uploaded music).
// To add another source, return the same track shape from a new search function.
const APP = 'Lilt';
const AUDIUS = 'https://api.audius.co/v1';

export async function searchTracks(q) {
  const r = await fetch(`${AUDIUS}/tracks/search?query=${encodeURIComponent(q)}&app_name=${APP}`);
  const { data = [] } = await r.json();
  return data.map((t) => ({
    id: t.id,
    url: `${AUDIUS}/tracks/${t.id}/stream?app_name=${APP}`,
    title: t.title,
    artist: t.user?.name ?? 'Unknown',
    artwork: t.artwork?.['480x480'],
    duration: t.duration,
  }));
}

// Synced lyrics from LRCLIB (free, line-level timestamps).
export async function getLyrics(track) {
  try {
    const u = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(track.artist)}&track_name=${encodeURIComponent(track.title)}&duration=${Math.round(track.duration || 0)}`;
    const r = await fetch(u);
    if (!r.ok) return [];
    const { syncedLyrics } = await r.json();
    if (!syncedLyrics) return [];
    return syncedLyrics.split('\n').map((l) => {
      const m = l.match(/^\[(\d+):(\d+\.\d+)\]\s?(.*)$/);
      return m ? { time: +m[1] * 60 + +m[2], text: m[3] } : null;
    }).filter(Boolean);
  } catch { return []; }
}
