import type { GameSound } from './controller';
import shuffle from './audio/shuffle.wav?inline';
import place from './audio/contact1.wav?inline';
import draw from './audio/card-slide-4.ogg?inline';
import code from './audio/code-complete.wav?inline';
import reveal from './audio/reveal.wav?inline';

const clips = { shuffle, place, draw, code, reveal };
type Clip = keyof typeof clips;

/** Vite embeds the five short clips so that playback never waits for a network request. */
async function decode(context: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const binary = atob(url.slice(url.indexOf(',') + 1));
    return await context.decodeAudioData(Uint8Array.from(binary, ch => ch.charCodeAt(0)).buffer);
  } catch {
    return null; // A browser may lack a decoder for a particular clip.
  }
}

export function createGameAudio() {
  let context: AudioContext | undefined;
  let ready: Promise<void> | undefined;
  const buffers = new Map<Clip, AudioBuffer>();
  let output: GainNode;

  function activate(): void {
    try {
      if (!context) {
        const audio = new AudioContext();
        context = audio;
        output = audio.createGain();
        output.gain.value = 0.65;
        output.connect(audio.destination);
        ready = Promise.all((Object.keys(clips) as Clip[]).map(async key => {
          const buffer = await decode(audio, clips[key]);
          if (buffer) buffers.set(key, buffer);
        })).then(() => {});
      }
      if (context.state !== 'running') void context.resume().catch(() => {});
    } catch {
      // Audio is optional when the browser or output device is unavailable.
    }
  }

  function play(sound: GameSound): void {
    void ready?.then(() => {
      const audio = context;
      if (!audio || audio.state === 'closed') return;
      const start = audio.currentTime;
      function emit(key: Clip, offset = 0): number {
        const buffer = buffers.get(key);
        if (!buffer) return 0;
        const source = output.context.createBufferSource();
        source.buffer = buffer;
        source.connect(output);
        source.start(start + offset);
        return buffer.duration;
      }
      if (sound === 'place-draw' || sound === 'place-code') {
        const placed = emit('place');
        emit(sound === 'place-draw' ? 'draw' : 'code', placed);
      } else {
        emit(sound);
      }
    }).catch(() => {});
  }

  return { activate, play };
}
