import { registerRootComponent } from 'expo';
import TrackPlayer from 'react-native-track-player';
import App from './App';
import { PlaybackService } from './service';

registerRootComponent(App);
// Keeps audio + lock-screen/notification controls alive when the app is backgrounded.
TrackPlayer.registerPlaybackService(() => PlaybackService);
