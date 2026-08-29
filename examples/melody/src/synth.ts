import { midiToHz, pitchName, type Note, type Tune } from './tunes.js';

export interface SequencerFrame {
  readonly title: string;
  readonly source: string;
  readonly pitch: string;
  readonly progress: number;
  readonly paused: boolean;
  readonly noteIndex: number;
}

export class Sequencer {
  paused = false;

  private tune: Tune;
  private noteIndex = 0;
  private sampleInNote = 0;
  private phase = 0;
  private readonly sampleRate: number;
  private readonly channels: number;
  private samplesPerBeat: number;

  constructor(tune: Tune, sampleRate: number, channels: number) {
    this.tune = tune;
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.samplesPerBeat = (60 / tune.bpm) * sampleRate;
  }

  setTune(tune: Tune): void {
    this.tune = tune;
    this.samplesPerBeat = (60 / tune.bpm) * this.sampleRate;
    this.restart();
  }

  restart(): void {
    this.noteIndex = 0;
    this.sampleInNote = 0;
    this.phase = 0;
  }

  fill(pcm: Int16Array): SequencerFrame {
    const frames = pcm.length / this.channels;
    for (let i = 0; i < frames; i++) {
      const v = this.paused ? 0 : this.nextSample();
      for (let c = 0; c < this.channels; c++) pcm[i * this.channels + c] = v;
    }
    return this.frame();
  }

  private nextSample(): number {
    const note = this.note();
    if (note === undefined) return 0;
    const noteSamples = Math.max(1, Math.round(note.beats * this.samplesPerBeat));
    const value = this.voice(note, noteSamples);
    this.sampleInNote++;
    if (this.sampleInNote >= noteSamples) {
      this.sampleInNote = 0;
      this.noteIndex = (this.noteIndex + 1) % this.tune.notes.length;
    }
    return value;
  }

  private voice(note: Note, noteSamples: number): number {
    if (note.midi === null) return 0;
    const env = envelope(this.sampleInNote, noteSamples, this.sampleRate);
    const freq = midiToHz(note.midi);
    const s =
      Math.sin(this.phase) +
      0.32 * Math.sin(this.phase * 2) +
      0.08 * Math.sin(this.phase * 3);
    this.phase += (2 * Math.PI * freq) / this.sampleRate;
    if (this.phase > Math.PI * 2) this.phase %= Math.PI * 2;
    return clampS16(s * env * 0.2 * 32767);
  }

  private note(): Note | undefined {
    return this.tune.notes[this.noteIndex];
  }

  private frame(): SequencerFrame {
    const note = this.note();
    const pitch = note?.midi === null || note?.midi === undefined ? 'rest' : pitchName(note.midi);
    const total = this.tune.notes.length;
    return {
      title: this.tune.title,
      source: this.tune.source,
      pitch,
      progress: total === 0 ? 0 : this.noteIndex / total,
      paused: this.paused,
      noteIndex: this.noteIndex,
    };
  }
}

function envelope(i: number, noteSamples: number, sampleRate: number): number {
  const attack = Math.max(1, Math.floor(sampleRate * 0.012));
  const release = Math.max(1, Math.min(Math.floor(sampleRate * 0.07), Math.floor(noteSamples * 0.22)));
  if (i < attack) return i / attack;
  if (i > noteSamples - release) return Math.max(0, ((noteSamples - i) / release) * 0.72);
  return 0.72;
}

function clampS16(value: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(value)));
}
