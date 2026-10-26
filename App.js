import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, ScrollView, Pressable, Image, Animated, Modal, StyleSheet,
  StatusBar, useWindowDimensions, LayoutAnimation, Platform, UIManager, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TrackPlayer, {
  useProgress, usePlaybackState, useActiveTrack, State, Capability, AppKilledPlaybackBehavior,
} from 'react-native-track-player';
import { searchAll, artistTracks, resolveTrack, getLyrics } from './api';

const C = { bg: '#0D0D0D', card: '#181818', line: '#2A2A2A', text: '#F2F2F2', dim: '#8A8A8A', acc: '#A78BFA' };
const KEY = 'lilt:v1';
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) UIManager.setLayoutAnimationEnabledExperimental(true);

const Press = ({ style, children, ...p }) => (
  <Pressable {...p} style={({ pressed }) => [style, { opacity: pressed ? 0.6 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
    {children}
  </Pressable>
);

const Art = ({ uri, size, round, label = '' }) => (
  uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: round ? size / 2 : 10, backgroundColor: C.card }} />
    : <View style={{ width: size, height: size, borderRadius: round ? size / 2 : 10, backgroundColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.acc, fontSize: size / 2.5, fontWeight: '700' }}>{label.slice(0, 1).toUpperCase() || '♪'}</Text>
      </View>
);

// Fades and slides its content in whenever `k` changes.
function FadeIn({ k, style, children }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { v.setValue(0); Animated.timing(v, { toValue: 1, duration: 260, useNativeDriver: true }).start(); }, [k]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>{children}</Animated.View>;
}

export default function App() {
  const { width } = useWindowDimensions();
  const W = Math.min(width, 900);
  const [page, setPage] = useState('home');
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [liked, setLiked] = useState([]);
  const [lists, setLists] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [grid, setGrid] = useState(true);
  const [allLiked, setAllLiked] = useState(false);
  const [sheet, setSheet] = useState(null); // { track? }
  const [name, setName] = useState('');
  const [lyr, setLyr] = useState([]);
  const [showLyr, setShowLyr] = useState(false);
  const active = useActiveTrack();
  const state = usePlaybackState();
  const { position } = useProgress(300);
  const lyrRef = useRef(null);

  useEffect(() => {
    (async () => {
      try { await TrackPlayer.setupPlayer(); } catch {}
      try {
        await TrackPlayer.updateOptions({
          android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback },
          capabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo],
        });
      } catch {}
    })();
    AsyncStorage.getItem(KEY).then((s) => {
      if (s) { const d = JSON.parse(s); setLiked(d.liked || []); setLists(d.lists || []); }
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);
  useEffect(() => { if (loaded) AsyncStorage.setItem(KEY, JSON.stringify({ liked, lists })).catch(() => {}); }, [liked, lists, loaded]);

  useEffect(() => {
    if (!q.trim()) { setRes(null); return; }
    const id = setTimeout(async () => {
      try { setRes(await searchAll(q.trim())); } catch { setRes({ artists: [], songs: [] }); }
    }, 350);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => { setLyr([]); if (active) getLyrics(active).then(setLyr); }, [active?.id]);
  const idx = lyr.reduce((a, l, i) => (l.time <= position ? i : a), -1);
  useEffect(() => { if (showLyr && idx >= 0) lyrRef.current?.scrollToIndex({ index: idx, viewPosition: 0.4, animated: true }); }, [idx, showLyr]);

  const play = async (list, i = 0) => {
    // Resolve stream URLs for the next few songs right before playing (they expire).
    const picked = list.slice(i, i + 8);
    const out = (await Promise.all(picked.map((t) => resolveTrack(t).catch(() => null)))).filter(Boolean);
    if (!out.length) return Alert.alert("Couldn't load that song", 'YouTube refused the request. Try another track, or check your connection.');
    await TrackPlayer.reset(); await TrackPlayer.add(out); await TrackPlayer.play();
  };
  const isLiked = (t) => liked.some((x) => x.id === t.id);
  const toggleLike = (t) => setLiked((l) => (isLiked(t) ? l.filter((x) => x.id !== t.id) : [t, ...l]));
  const swapView = () => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setGrid(!grid); };
  const openArtist = async (a) => setRes({ artists: [a], songs: await artistTracks(a) });
  const createList = () => {
    if (!name.trim()) return;
    const p = { id: String(Date.now()), name: name.trim(), tracks: sheet?.track ? [sheet.track] : [] };
    setLists((l) => [...l, p]); setName(''); setSheet(null);
  };
  const addTo = (pid) => { setLists((l) => l.map((p) => (p.id === pid && !p.tracks.some((x) => x.id === sheet.track.id) ? { ...p, tracks: [...p.tracks, sheet.track] } : p))); setSheet(null); };
  const delList = (p) => Alert.alert(p.name, 'Delete this playlist?', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => setLists((l) => l.filter((x) => x.id !== p.id)) }]);

  const Row = ({ t, list, i }) => (
    <Press style={s.row} onPress={() => play(list, i)}>
      <Art uri={t.artwork} size={48} label={t.title} />
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={1}>{t.title}</Text>
        <Text style={s.dim} numberOfLines={1}>{t.artist}</Text>
      </View>
      <Press onPress={() => toggleLike(t)} hitSlop={10}><Text style={[s.icon, isLiked(t) && { color: C.acc }]}>{isLiked(t) ? '♥' : '♡'}</Text></Press>
      <Press onPress={() => setSheet({ track: t })} hitSlop={10}><Text style={s.icon}>+</Text></Press>
    </Press>
  );

  const cols = Math.max(2, Math.floor((W - 40) / 160));
  const cardW = (W - 40 - (cols - 1) * 12) / cols;
  const playing = state?.state === State.Playing;
  const shownLiked = allLiked ? liked : liked.slice(0, 5);

  const Home = (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 30 }}>
      <View style={s.searchWrap}>
        <TextInput style={s.input} placeholder="Search songs or artists" placeholderTextColor={C.dim} value={q} onChangeText={setQ} autoCorrect={false} />
        {!!q && <Press onPress={() => setQ('')}><Text style={s.icon}>✕</Text></Press>}
      </View>

      {res && (
        <FadeIn k={q + (res.songs[0]?.id || '')} style={{ marginTop: 18 }}>
          {res.artists.length > 0 && <>
            <Text style={s.h}>Artists</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {res.artists.map((a) => (
                <Press key={a.id} style={{ alignItems: 'center', marginRight: 16, width: 84 }} onPress={() => openArtist(a)}>
                  <Art uri={a.art} size={72} round label={a.name} />
                  <Text style={[s.dim, { marginTop: 6, color: C.text }]} numberOfLines={1}>{a.name}</Text>
                </Press>
              ))}
            </ScrollView>
          </>}
          <Text style={s.h}>Songs</Text>
          {res.songs.length === 0 && <Text style={s.dim}>No results.</Text>}
          {res.songs.map((t, i) => <Row key={t.id} t={t} list={res.songs} i={i} />)}
        </FadeIn>
      )}

      <View style={s.divider} />

      <Text style={s.h}>Liked Songs</Text>
      {liked.length === 0 && <Text style={s.dim}>Tap ♡ on a song to save it here.</Text>}
      {shownLiked.map((t, i) => <Row key={t.id} t={t} list={liked} i={i} />)}
      {liked.length > 5 && (
        <Press onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setAllLiked(!allLiked); }}>
          <Text style={[s.dim, { color: C.acc, paddingVertical: 8 }]}>{allLiked ? 'Show less' : `Show all ${liked.length}`}</Text>
        </Press>
      )}

      <View style={[s.between, { marginTop: 26 }]}>
        <Text style={s.h}>Playlists</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Press style={s.pill} onPress={() => setSheet({})}><Text style={s.pillT}>+ New</Text></Press>
          <Press style={s.pill} onPress={swapView}><Text style={s.pillT}>{grid ? 'List' : 'Grid'}</Text></Press>
        </View>
      </View>
      {lists.length === 0 && <Text style={s.dim}>No playlists yet. Tap + New, or + on any song.</Text>}
      <View style={grid ? { flexDirection: 'row', flexWrap: 'wrap', gap: 12 } : null}>
        {lists.map((p) => grid ? (
          <Press key={p.id} style={[s.card, { width: cardW }]} onPress={() => play(p.tracks)} onLongPress={() => delList(p)}>
            <Art uri={p.tracks[0]?.artwork} size={cardW - 20} label={p.name} />
            <Text style={[s.title, { marginTop: 8 }]} numberOfLines={1}>{p.name}</Text>
            <Text style={s.dim}>{p.tracks.length} songs</Text>
          </Press>
        ) : (
          <Press key={p.id} style={[s.row, s.strip]} onPress={() => play(p.tracks)} onLongPress={() => delList(p)}>
            <Art uri={p.tracks[0]?.artwork} size={44} label={p.name} />
            <View style={{ flex: 1 }}>
              <Text style={s.title} numberOfLines={1}>{p.name}</Text>
              <Text style={s.dim}>{p.tracks.length} songs</Text>
            </View>
          </Press>
        ))}
      </View>
    </ScrollView>
  );

  const Settings = (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Text style={[s.h, { fontSize: 26, marginBottom: 16 }]}>Settings</Text>
      <Press style={s.setRow} onPress={() => setLiked([])}><Text style={s.title}>Clear liked songs</Text></Press>
      <Press style={s.setRow} onPress={() => setLists([])}><Text style={s.title}>Delete all playlists</Text></Press>
      <View style={s.setRow}><Text style={s.title}>About</Text><Text style={s.dim}>Lilt 0.1.0 · Music: YouTube Music (unofficial) · Lyrics: LRCLIB</Text></View>
      <Text style={[s.dim, { marginTop: 14 }]}>Tip: long-press a playlist to delete it.</Text>
    </ScrollView>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.page}>
        <FadeIn k={page} style={{ flex: 1 }}>{page === 'home' ? Home : Settings}</FadeIn>
      </View>

      {active && (
        <Press style={s.mini} onPress={() => setShowLyr(true)}>
          <Art uri={active.artwork} size={40} label={active.title} />
          <View style={{ flex: 1 }}>
            <Text style={s.title} numberOfLines={1}>{active.title}</Text>
            <Text style={s.dim} numberOfLines={1}>{active.artist}</Text>
          </View>
          <Press onPress={() => TrackPlayer.skipToPrevious()} hitSlop={8}><Text style={s.icon}>⏮</Text></Press>
          <Press onPress={() => (playing ? TrackPlayer.pause() : TrackPlayer.play())} hitSlop={8}><Text style={[s.icon, { color: C.acc }]}>{playing ? '❚❚' : '▶'}</Text></Press>
          <Press onPress={() => TrackPlayer.skipToNext()} hitSlop={8}><Text style={s.icon}>⏭</Text></Press>
        </Press>
      )}

      <View style={s.nav}>
        {[['home', 'Home'], ['settings', 'Settings']].map(([k, label]) => (
          <Press key={k} style={s.navBtn} onPress={() => setPage(k)}>
            <Text style={[s.navT, page === k && { color: C.acc }]}>{label}</Text>
            <View style={[s.dot, page === k && { backgroundColor: C.acc }]} />
          </Press>
        ))}
      </View>

      <Modal visible={showLyr} animationType="slide" onRequestClose={() => setShowLyr(false)}>
        <View style={[s.root, { paddingTop: 50 }]}>
          <Press style={{ padding: 20 }} onPress={() => setShowLyr(false)}><Text style={s.title}>✕  {active?.title}</Text></Press>
          <FlatList
            ref={lyrRef} data={lyr} keyExtractor={(_, i) => String(i)} onScrollToIndexFailed={() => {}}
            contentContainerStyle={{ padding: 28 }}
            ListEmptyComponent={<Text style={s.dim}>No synced lyrics for this track.</Text>}
            renderItem={({ item, index }) => (
              <Text onPress={() => TrackPlayer.seekTo(item.time)} style={[s.line, index === idx && { color: C.text }]}>{item.text || '♪'}</Text>
            )}
          />
        </View>
      </Modal>

      <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable style={s.scrim} onPress={() => setSheet(null)}>
          <Pressable style={s.sheet}>
            {sheet?.track && lists.length > 0 && <>
              <Text style={s.h}>Add to playlist</Text>
              {lists.map((p) => <Press key={p.id} style={s.setRow} onPress={() => addTo(p.id)}><Text style={s.title}>{p.name}</Text></Press>)}
            </>}
            <Text style={[s.h, { marginTop: 12 }]}>New playlist</Text>
            <TextInput style={s.input2} placeholder="Name" placeholderTextColor={C.dim} value={name} onChangeText={setName} onSubmitEditing={createList} />
            <Press style={[s.pill, { backgroundColor: C.acc, alignSelf: 'flex-end', marginTop: 10 }]} onPress={createList}><Text style={[s.pillT, { color: '#0D0D0D' }]}>Create</Text></Press>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  page: { flex: 1, width: '100%', maxWidth: 900, alignSelf: 'center', paddingTop: 44 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, paddingRight: 16, borderWidth: 1, borderColor: C.line },
  input: { flex: 1, padding: 16, color: C.text, fontSize: 16 },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 24 },
  h: { color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 10 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 },
  strip: { backgroundColor: C.card, borderRadius: 12, padding: 8, marginBottom: 8 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 10 },
  title: { color: C.text, fontSize: 15, fontWeight: '600' },
  dim: { color: C.dim, fontSize: 13 },
  icon: { color: C.dim, fontSize: 20, paddingHorizontal: 6 },
  pill: { backgroundColor: C.card, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: C.line },
  pillT: { color: C.text, fontSize: 13, fontWeight: '600' },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, paddingHorizontal: 16, backgroundColor: C.card, borderTopWidth: 1, borderColor: C.line },
  nav: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 36, paddingTop: 10, paddingBottom: 22, backgroundColor: C.bg, borderTopWidth: 1, borderColor: C.line },
  navBtn: { alignItems: 'center', gap: 5, padding: 6 },
  navT: { color: C.dim, fontSize: 14, fontWeight: '600' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
  setRow: { backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 8, gap: 4 },
  line: { color: '#5A5A5A', fontSize: 26, fontWeight: '700', marginBottom: 22, lineHeight: 32 },
  scrim: { flex: 1, backgroundColor: '#000A', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, padding: 20, paddingBottom: 30, borderTopLeftRadius: 22, borderTopRightRadius: 22, width: '100%', maxWidth: 900, alignSelf: 'center' },
  input2: { backgroundColor: C.bg, color: C.text, borderRadius: 12, padding: 14, fontSize: 16, borderWidth: 1, borderColor: C.line },
});
