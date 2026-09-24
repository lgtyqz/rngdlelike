const SOUND_KEY = "rngdlelike.sound.v1";

// Replace the silent WAV placeholders with final assets, or update these paths.
// Paths are relative to this module; volume is per cue (0–1).
export const SOUND_REGISTRY = {
  click: { src: "../assets/sounds/click.wav", volume: 0.8 },
  mousedown: { src: "../assets/sounds/mousedown.wav", volume: 0.5 },
  mouseup: { src: "../assets/sounds/mouseup.wav", volume: 0.8 },
  legendary: { src: "../assets/sounds/legendary.wav", volume: 0.8 },
  kaboom: { src: "../assets/sounds/kaboom.wav", volume: 0.8 },
  camera: { src: "../assets/sounds/camera.wav", volume: 1 },
  start: { src: "../assets/sounds/start.wav", volume: 0.8 },
  coin: { src: "../assets/sounds/coin.wav", volume: 0.8 },
  spin: { src: "../assets/sounds/spin.wav", volume: 0.8 },
  tick: { src: "../assets/sounds/tick.wav", volume: 0.8 },
  land: { src: "../assets/sounds/land.wav", volume: 0.8 },
  tool: { src: "../assets/sounds/tool.wav", volume: 0.8 },
  score: { src: "../assets/sounds/score.wav", volume: 0.8 },
  reroll: { src: "../assets/sounds/reroll.wav", volume: 0.8 },
  buy: { src: "../assets/sounds/buy.wav", volume: 0.8 },
  bonus: { src: "../assets/sounds/bonus.wav", volume: 0.8 },
  settle: { src: "../assets/sounds/settle.wav", volume: 0.8 },
  finish: { src: "../assets/sounds/finish.wav", volume: 0.8 },
  error: { src: "../assets/sounds/error.wav", volume: 0.8 },
};

/** Owns a lazily unlocked audio context and the persistent sound preference. */
export class GameAudio {
  constructor() {
    this.enabled = true;
    this.context = null;
    this.voices = new Set();
    this.lastCue = new Map();
    this.buffers = new Map();
    this.generation = 0;
    this.scorePitch = 0;
    try {
      this.enabled = localStorage.getItem(SOUND_KEY) !== "off";
    } catch {}
  }

  /** Call during a user gesture to satisfy browser autoplay restrictions. */
  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        const AudioContext =
          globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContext) return;
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0.16;
        this.master.connect(this.context.destination);
        for (const name of Object.keys(SOUND_REGISTRY)) this.load(name);
      }
      if (this.context.state === "suspended")
        this.context.resume().catch(() => {});
    } catch {
      // Audio is optional: unsupported or blocked audio must never stop a run.
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.stop();
    try {
      localStorage.setItem(SOUND_KEY, this.enabled ? "on" : "off");
    } catch {}
    if (this.enabled) {
      this.unlock();
      this.play("click");
    }
  }

  /** Cancel playback and invalidate any cues still waiting for an asset. */
  stop() {
    this.generation++;
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {}
    }
    this.voices.clear();
    this.lastCue.clear();
  }

  /** Cache decoded files, including failures, to avoid repeated failed requests. */
  load(name) {
    if (!this.buffers.has(name)) {
      const pending = (async () => {
        try {
          const response = await fetch(
            new URL(SOUND_REGISTRY[name].src, import.meta.url),
          );
          if (!response.ok) return null;
          return await this.context.decodeAudioData(
            await response.arrayBuffer(),
          );
        } catch {
          return null;
        }
      })();
      this.buffers.set(name, pending);
    }
    return this.buffers.get(name);
  }

  async play(name) {
    if (name === "spin") this.scorePitch = 0;
    const context = this.context;
    if (
      !Object.hasOwn(SOUND_REGISTRY, name) ||
      !this.enabled ||
      !context ||
      !this.master ||
      context.state === "closed" ||
      document.hidden
    )
      return;
    const now = context.currentTime;
    // Reduced motion / fast scoring may resolve many events in one frame.
    if (now - (this.lastCue.get(name) ?? -Infinity) < 0.045) return;
    this.lastCue.set(name, now);
    let playbackRate = 1;
    if (name === "score") {
      playbackRate = 2 ** (this.scorePitch / 12);
      this.scorePitch += 0.3;
    }
    const generation = this.generation;
    const buffer = await this.load(name);
    if (
      !buffer ||
      generation !== this.generation ||
      !this.enabled ||
      document.hidden ||
      context.state === "closed" ||
      this.voices.size >= 200
    )
      return;
    try {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.playbackRate.value = playbackRate;
      gain.gain.value = SOUND_REGISTRY[name].volume;
      source.connect(gain);
      gain.connect(this.master);
      this.voices.add(source);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        this.voices.delete(source);
      };
      source.start();
    } catch {}
  }
}
