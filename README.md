# Lilt
An unofficial, ad-free YouTube Music player for Android. Search, play with no interruptions, follow synced lyrics, and keep listening with the screen off.

Not affiliated with or endorsed by YouTube or Google.

Status: the current build streams from Audius as a placeholder source while the YouTube Music source is added. Lyrics come from LRCLIB.

## Run locally (needs Android Studio + a phone or emulator)
    npm install
    npx expo prebuild --platform android
    npx expo run:android
Expo Go will NOT work; the audio library needs a native build.

## Release an APK for others
    git tag v0.1.0 && git push --tags
GitHub Actions builds the APK and attaches it to the release. Users download it and allow "install unknown apps".
