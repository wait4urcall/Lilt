// Music source: YouTube Music (unofficial InnerTube API, no key or login needed).
// If playback ever breaks, the usual fix is updating VR_VERSION / the User-Agent below.
const e = encodeURIComponent;
const VR_VERSION = '1.56.21';
const UA = `com.google.android.apps.youtube.vr.oculus/${VR_VERSION} (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; Cronet/107.0.5284.2)`;
const dedupe = (a) => [...new Map(a.map((t) => [t.id, t])).values()];

// ---------- search (YouTube Music) ----------
async function ytmSearch(query) {
  const r = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://music.youtube.com' },
    body: JSON.stringify({ query, context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20250101.01.00', hl: 'en', gl: 'US' } } }),
  });
  if (!r.ok) throw new Error('search ' + r.status);
  const data = await r.json();
  const songs = [], artists = [];
  const txt = (col) => (col?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []).map((x) => x.text);
  const thumb = (o) => { const a = o?.musicThumbnailRenderer?.thumbnail?.thumbnails; return a?.[a.length - 1]?.url; };
  const dur = (runs) => { const m = runs[runs.length - 1]?.match(/^(?:(\d+):)?(\d+):(\d+)$/); return m ? (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3] : 0; };

  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    const it = n.musicResponsiveListItemRenderer;
    if (it) {
      const title = txt(it.flexColumns?.[0])[0], sub = txt(it.flexColumns?.[1]), type = sub[0];
      const vid = it.playlistItemData?.videoId;
      const bid = it.navigationEndpoint?.browseEndpoint?.browseId;
      if (vid && title && (type === 'Song' || type === 'Video')) {
        songs.push({ id: vid, yt: true, title, artist: sub[2] || 'Unknown', artwork: thumb(it.thumbnail), duration: dur(sub) });
      } else if (type === 'Artist' && bid) {
        artists.push({ id: bid, name: title, art: thumb(it.thumbnail) });
      }
    }
    const card = n.musicCardShelfRenderer; // "Top result"
    if (card) {
      const t = card.title?.runs?.[0], sub = (card.subtitle?.runs || []).map((x) => x.text);
      const vid = t?.navigationEndpoint?.watchEndpoint?.videoId, bid = t?.navigationEndpoint?.browseEndpoint?.browseId;
      if (vid && (sub[0] === 'Song' || sub[0] === 'Video')) songs.unshift({ id: vid, yt: true, title: t.text, artist: sub[2] || 'Unknown', artwork: thumb(card.thumbnail), duration: dur(sub) });
      else if (bid && sub[0] === 'Artist') artists.unshift({ id: bid, name: t.text, art: thumb(card.thumbnail) });
    }
    Object.values(n).forEach(walk);
  };
  walk(data);
  return { songs: dedupe(songs), artists: [...new Map(artists.map((a) => [a.id, a])).values()] };
}

const byArtist = (songs, name) => songs.filter((s) => s.artist.toLowerCase().includes(name.toLowerCase()));

export async function artistTracks(a) {
  const { songs } = await ytmSearch(a.name + ' songs');
  const mine = byArtist(songs, a.name);
  return mine.length ? mine : songs;
}

// Songs + artists together; the top artist's own songs are merged in.
export async function searchAll(q) {
  const { songs, artists } = await ytmSearch(q);
  let all = songs;
  if (artists[0]) all = dedupe([...byArtist((await ytmSearch(artists[0].name + ' songs')).songs, artists[0].name), ...songs]);
  return { artists: artists.slice(0, 6), songs: all };
}

// ---------- stream URL (resolved right before playback; URLs expire) ----------
export async function resolveTrack(t) {
  if (!t.yt) return t; // already has a url
  const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'X-YouTube-Client-Name': '28', 'X-YouTube-Client-Version': VR_VERSION },
    body: JSON.stringify({
      videoId: t.id, contentCheckOk: true, racyCheckOk: true,
      context: { client: { clientName: 'ANDROID_VR', clientVersion: VR_VERSION, deviceMake: 'Oculus', deviceModel: 'Quest 3', osName: 'Android', osVersion: '12', androidSdkVersion: 32, hl: 'en', timeZone: 'UTC', utcOffsetMinutes: 0 } },
    }),
  });
  const d = await r.json();
  const fmts = (d.streamingData?.adaptiveFormats || []).filter((f) => f.mimeType?.startsWith('audio/') && f.url);
  if (!fmts.length) throw new Error(d.playabilityStatus?.reason || 'no stream');
  const best = (list) => list.sort((a, b) => b.bitrate - a.bitrate)[0];
  const f = best(fmts.filter((x) => x.mimeType.includes('mp4a'))) || best(fmts);
  return { ...t, url: f.url, userAgent: UA, headers: { 'User-Agent': UA } };
}

// ---------- lyrics (LRCLIB, line-synced) ----------
export async function getLyrics(track) {
  try {
    const r = await fetch(`https://lrclib.net/api/get?artist_name=${e(track.artist)}&track_name=${e(track.title)}&duration=${Math.round(track.duration || 0)}`);
    if (!r.ok) return [];
    const { syncedLyrics } = await r.json();
    if (!syncedLyrics) return [];
    return syncedLyrics.split('\n').map((l) => {
      const m = l.match(/^\[(\d+):(\d+\.\d+)\]\s?(.*)$/);
      return m ? { time: +m[1] * 60 + +m[2], text: m[3] } : null;
    }).filter(Boolean);
  } catch { return []; }
}
