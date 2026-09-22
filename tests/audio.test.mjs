import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GameAudio, SOUND_REGISTRY } from "../js/audio.js";

function setup() {
  const stored = new Map();
  globalThis.localStorage = {
    getItem: (key) => stored.get(key),
    setItem: (key, value) => stored.set(key, value),
  };
  globalThis.document = { hidden: false };
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  globalThis.AudioContext = class {
    state = "suspended";
    currentTime = 0;
    destination = {};
    resume() { this.state = "running"; return Promise.resolve(); }
    createGain() { return { gain: param(), connect() {}, disconnect() {} }; }
    async decodeAudioData(data) { return { data }; }
    createBufferSource() {
      return {
        frequency: param(), playbackRate: param(), connect() {}, disconnect() {}, start() {},
        stop(when) { if (when === undefined) this.cancelled = true; },
      };
    }
  };
}

test("audio stays lazy and remembers mute across instances", async () => {
  setup();
  const audio = new GameAudio();
  await audio.play("start");
  assert.equal(audio.context, null);
  audio.toggle();
  const restored = new GameAudio();
  assert.equal(restored.enabled, false);
  restored.unlock();
  assert.equal(restored.context, null);
  restored.toggle();
  assert.equal(restored.context.state, "running");
  assert.equal(new GameAudio().enabled, true);
});

test("muting stops active asset playback immediately", async () => {
  setup();
  const audio = new GameAudio();
  audio.unlock();
  await audio.play("finish");
  const notes = [...audio.voices];
  assert.equal(notes.length, 1);
  audio.toggle();
  assert.ok(notes.every((note) => note.cancelled));
  await audio.play("buy");
  assert.equal(audio.voices.size, 0);
});

test("hidden tabs stay silent and fast events are rate limited", async () => {
  setup();
  const audio = new GameAudio();
  audio.unlock();
  document.hidden = true;
  await audio.play("bonus");
  assert.equal(audio.voices.size, 0);
  document.hidden = false;
  for (let i = 0; i < 100; i++) await audio.play("score", i);
  assert.equal(audio.voices.size, 1);
  audio.context.currentTime = 0.1;
  await audio.play("score", 2);
  assert.equal(audio.voices.size, 2);
  const note = [...audio.voices][0];
  note.onended();
  assert.equal(audio.voices.size, 1);
});

test("score cues rise by a semitone until the next spin", async () => {
  setup();
  const audio = new GameAudio();
  audio.unlock();
  await audio.play("score");
  audio.context.currentTime = 0.1;
  await audio.play("score");
  let scores = [...audio.voices];
  assert.equal(scores[0].playbackRate.value, 1);
  assert.equal(scores[1].playbackRate.value, 2 ** (1 / 12));

  audio.context.currentTime = 0.2;
  await audio.play("spin");
  audio.context.currentTime = 0.3;
  await audio.play("score");
  scores = [...audio.voices];
  assert.equal(scores.at(-1).playbackRate.value, 1);
});

test("unavailable audio and blocked storage do not break gameplay", async () => {
  setup();
  delete globalThis.AudioContext;
  globalThis.localStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  const audio = new GameAudio();
  assert.doesNotThrow(() => {
    audio.unlock();
    audio.play("spin");
    audio.toggle();
    audio.toggle();
  });
  assert.equal(audio.context, null);
});

test("polyphony stays bounded even if playback is suspended", async () => {
  setup();
  const audio = new GameAudio();
  audio.unlock();
  for (let i = 0; i < 100; i++) {
    audio.context.currentTime += 0.1;
    await audio.play("finish");
  }
  assert.equal(audio.voices.size, 24);
  audio.stop();
  assert.equal(audio.voices.size, 0);
});


test("registry points to valid WAV placeholders for every gameplay cue", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  for (const [, name] of app.matchAll(/sound\.play\("([^"\n]+)"/g)) {
    assert.ok(Object.hasOwn(SOUND_REGISTRY, name), name);
  }
  for (const cue of Object.values(SOUND_REGISTRY)) {
    const file = await readFile(new URL(cue.src, new URL("../js/audio.js", import.meta.url)));
    assert.equal(file.toString("ascii", 0, 4), "RIFF");
    assert.equal(file.toString("ascii", 8, 12), "WAVE");
    assert.ok(cue.volume >= 0 && cue.volume <= 1);
  }
});

test("muting while a file loads prevents delayed playback", async () => {
  setup();
  let finish;
  const response = new Promise((resolve) => { finish = resolve; });
  globalThis.fetch = () => response;
  const audio = new GameAudio();
  audio.unlock();
  const playing = audio.play("finish");
  audio.toggle();
  finish({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  await playing;
  assert.equal(audio.voices.size, 0);
});

test("missing assets are cached and skipped without rejecting playback", async () => {
  setup();
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("missing"); };
  const audio = new GameAudio();
  audio.unlock();
  await audio.play("spin");
  audio.context.currentTime += 1;
  await audio.play("spin");
  assert.equal(requests, Object.keys(SOUND_REGISTRY).length);
  assert.equal(audio.voices.size, 0);
  await audio.play("unknown");
});
