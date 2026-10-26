import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, Image, StyleSheet, StatusBar } from 'react-native';
import TrackPlayer, {
  useProgress, usePlaybackState, useActiveTrack, State, Capability, AppKilledPlaybackBehavior,
} from 'react-native-track-player';
import { searchTracks, getLyrics } from './api';

const C = { bg: '#1A1226', panel: '#261A38', text: '#F3EDFF', dim: '#9C8FB5', accent: '#6EE7D8' };

export default function App() {
  const [ready, setReady] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [lyrics, setLyrics] = useState([]);
  const [showLyrics, setShowLyrics] = useState(false);
  const active = useActiveTrack();
  const state = usePlaybackState();
  const { position } = useProgress(300);
  const listRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        await TrackPlayer.setupPlayer();
        await TrackPlayer.updateOptions({
          android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback },
          capabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo],
        });
      } catch {} // already set up (fast refresh)
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    setLyrics([]);
    if (active) getLyrics(active).then(setLyrics);
  }, [active?.id]);

  const idx = lyrics.reduce((a, l, i) => (l.time <= position ? i : a), -1);
  useEffect(() => {
    if (showLyrics && idx >= 0) listRef.current?.scrollToIndex({ index: idx, viewPosition: 0.4, animated: true });
  }, [idx, showLyrics]);

  const search = async () => q.trim() && setResults(await searchTracks(q.trim()));
  const play = async (i) => {
    await TrackPlayer.reset();
    await TrackPlayer.add(results.slice(i));
    await TrackPlayer.play();
  };
  const playing = state?.state === State.Playing;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      {showLyrics ? (
        <FlatList
          ref={listRef}
          data={lyrics}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: 28, paddingTop: 90 }}
          onScrollToIndexFailed={() => {}}
          ListEmptyComponent={<Text style={s.dim}>No synced lyrics for this track.</Text>}
          renderItem={({ item, index }) => (
            <Text onPress={() => TrackPlayer.seekTo(item.time)} style={[s.line, index === idx && s.lineOn]}>{item.text || '♪'}</Text>
          )}
        />
      ) : (
        <>
          <TextInput
            style={s.input}
            placeholder="Search artists or tracks"
            placeholderTextColor={C.dim}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={search}
            returnKeyType="search"
          />
          <FlatList
            data={results}
            keyExtractor={(t) => t.id}
            ListEmptyComponent={<Text style={[s.dim, { padding: 24 }]}>Search to start listening.</Text>}
            renderItem={({ item, index }) => (
              <TouchableOpacity style={s.row} onPress={() => play(index)}>
                <Image source={{ uri: item.artwork }} style={s.art} />
                <View style={{ flex: 1 }}>
                  <Text style={s.title} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.dim} numberOfLines={1}>{item.artist}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </>
      )}
      {active && (
        <View style={s.bar}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowLyrics(!showLyrics)}>
            <Text style={s.title} numberOfLines={1}>{active.title}</Text>
            <Text style={s.dim} numberOfLines={1}>{showLyrics ? 'Back to search' : 'Show lyrics'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => TrackPlayer.skipToPrevious()}><Text style={s.btn}>Prev</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => (playing ? TrackPlayer.pause() : TrackPlayer.play())}>
            <Text style={[s.btn, { color: C.accent }]}>{playing ? 'Pause' : 'Play'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => TrackPlayer.skipToNext()}><Text style={s.btn}>Next</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  input: { margin: 16, marginTop: 64, padding: 14, borderRadius: 14, backgroundColor: C.panel, color: C.text, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
  art: { width: 52, height: 52, borderRadius: 8, backgroundColor: C.panel },
  title: { color: C.text, fontSize: 16, fontWeight: '600' },
  dim: { color: C.dim, fontSize: 13 },
  line: { color: C.dim, fontSize: 26, fontWeight: '700', marginBottom: 22, lineHeight: 32 },
  lineOn: { color: C.text },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, paddingBottom: 28, backgroundColor: C.panel },
  btn: { color: C.text, fontSize: 15, fontWeight: '600' },
});
