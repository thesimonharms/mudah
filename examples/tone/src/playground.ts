import {
  KeyParser,
  detectCapabilities,
  disableKittyKeyboard,
  enableKittyKeyboard,
  enterRawMode,
  type OscWriter,
} from '@mudah-cli/mudah/terminal';
import { AudioOut } from '@mudah-cli/audio';

const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const FRAMES = 1024;

export async function runPlayground(
  stdout: OscWriter & { columns?: number; rows?: number; isTTY?: boolean },
  stdin: NodeJS.ReadStream,
): Promise<number> {
  const caps = detectCapabilities({ isTty: stdout.isTTY === true });
  if (!caps.isTty) {
    stdout.write('tone needs a TTY. Run it in a terminal.\n');
    return 1;
  }

  const out = await AudioOut.open({
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    framesPerBuffer: FRAMES,
    backend: 'auto',
  });

  let energy = 0;
  let holding = false;
  let running = true;
  let code = 0;
  let phase = 0;

  const restore: string[] = [];
  stdout.write('\x1b[?1049h\x1b[?25l\x1b[H\x1b[2J');
  restore.push('\x1b[?25h\x1b[?1049l');
  if (caps.kittyKeyboard) {
    stdout.write(enableKittyKeyboard());
    restore.unshift(disableKittyKeyboard());
  }

  const parser = new KeyParser();
  const stopRaw = enterRawMode(stdin);

  const onData = (chunk: Buffer | string): void => {
    for (const event of parser.feed(String(chunk))) {
      if (event.name === 'escape' || event.name === 'ctrl+c') {
        if (event.kind !== 'release') {
          running = false;
          code = event.name === 'ctrl+c' ? 130 : 0;
        }
        continue;
      }
      if (event.name === 'space') {
        if (caps.kittyKeyboard) {
          holding = event.kind !== 'release';
        } else if (event.kind !== 'release' && event.kind !== 'repeat') {
          holding = !holding;
        }
        continue;
      }
      if (event.kind === 'release' || event.kind === 'repeat') continue;
      if (event.name === '1') {
        void out.play({
          samples: makeBlip(SAMPLE_RATE, CHANNELS),
          sampleRate: SAMPLE_RATE,
          channels: CHANNELS,
        });
      }
    }
  };
  stdin.on('data', onData);

  const frameMs = (FRAMES / SAMPLE_RATE) * 1000;
  const pcm = new Int16Array(FRAMES * CHANNELS);

  try {
    while (running) {
      const tickStart = performance.now();
      energy += ((holding ? 1 : 0) - energy) * 0.18;
      phase = fillSine(pcm, phase, energy, SAMPLE_RATE, CHANNELS);
      out.write(pcm);

      const backend =
        out.backendKind === 'spawn' && out.spawnTool !== undefined
          ? `${out.backendKind} (${out.spawnTool})`
          : out.backendKind;
      const bar = meter(energy, 24);
      stdout.write('\x1b[H\x1b[2K');
      stdout.write(`\x1b[38;5;245mtone\x1b[0m  ${backend}  energy ${energy.toFixed(2)}\n`);
      stdout.write(`\x1b[2K${bar}\n`);
      stdout.write('\x1b[2Kspace hold   1 blip   esc quit');

      const elapsed = performance.now() - tickStart;
      await sleep(Math.max(0, frameMs - elapsed));
    }
  } finally {
    stdin.off('data', onData);
    stopRaw();
    out.dispose();
    stdout.write(restore.join(''));
  }
  return code;
}

export function fillSine(
  pcm: Int16Array,
  phase: number,
  energy: number,
  sampleRate: number,
  channels: number,
): number {
  const freq = 220 + energy * 440;
  const amp = 0.08 + energy * 0.22;
  const frames = pcm.length / channels;
  for (let i = 0; i < frames; i++) {
    const t = (phase + i) / sampleRate;
    const s = Math.sin(2 * Math.PI * freq * t) * amp * 32767;
    const v = Math.max(-32768, Math.min(32767, Math.round(s)));
    for (let c = 0; c < channels; c++) pcm[i * channels + c] = v;
  }
  return phase + frames;
}

export function makeBlip(sampleRate: number, channels: number): Int16Array {
  const frames = Math.floor(sampleRate * 0.12);
  const samples = new Int16Array(frames * channels);
  for (let i = 0; i < frames; i++) {
    const env = Math.exp(-i / (sampleRate * 0.04));
    const s = Math.sin((2 * Math.PI * 880 * i) / sampleRate) * env * 0.35 * 32767;
    const v = Math.max(-32768, Math.min(32767, Math.round(s)));
    for (let c = 0; c < channels; c++) samples[i * channels + c] = v;
  }
  return samples;
}

function meter(energy: number, width: number): string {
  const filled = Math.round(Math.max(0, Math.min(1, energy)) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
