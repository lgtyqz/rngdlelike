# Sound assets

These WAV files are valid, silent 100 ms placeholders, one per gameplay cue.
Replace them with finished sound effects using the same filenames, or change
`SOUND_REGISTRY` in `js/audio.js` to point to other browser-supported audio files.
Each registry entry has a module-relative `src` and a per-cue `volume` (0–1).

Files are loaded and decoded on the first enabled interaction. Reload the page
after replacing files. Missing or invalid audio is skipped without stopping gameplay.
