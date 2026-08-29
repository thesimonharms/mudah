import {
  KeyParser,
  detectCapabilities,
  disableKittyKeyboard,
  enableKittyKeyboard,
  enterRawMode,
  type OscWriter,
} from '@mudah-cli/mudah/terminal';
import { AudioOut } from '@mudah-cli/audio';
import { Sequencer } from './synth.js';
import { TUNES, tuneAt } from './tunes.js';

const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const FRAMES = 1024;

export async function runPlayground(
  stdout: OscWriter & { columns?: number; rows?: number; isTTY?: boolean },
  stdin: NodeJS.ReadStream,
): Promise<number> {
  const caps = detectCapabilities({ isTty: stdout.isTTY === true });
  if (!caps.isTty) {
    stdout.write('melody needs a TTY. Run it in a terminal.\n');
    return 1;
  }

  const out = await AudioOut.open({
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    framesPerBuffer: FRAMES,
    backend: 'auto',
  });

  let tuneIndex = 0;
  const seq = new Sequencer(tuneAt(0), SAMPLE_RATE, CHANNELS);
  let running = true;
  let code = 0;

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
      if (event.kind === 'release' || event.kind === 'repeat') continue;
      if (event.name === 'escape' || event.name === 'ctrl+c') {
        running = false;
        code = event.name === 'ctrl+c' ? 130 : 0;
        continue;
      }
      if (event.name === 'space') {
        seq.paused = !seq.paused;
        continue;
      }
      if (event.name === 'r') {
        seq.restart();
        continue;
      }
      if (event.name === 'left') {
        tuneIndex = (tuneIndex + TUNES.length - 1) % TUNES.length;
        seq.setTune(tuneAt(tuneIndex));
        continue;
      }
      if (event.name === 'right') {
        tuneIndex = (tuneIndex + 1) % TUNES.length;
        seq.setTune(tuneAt(tuneIndex));
        continue;
      }
      if (event.name === '1' || event.name === '2' || event.name === '3') {
        tuneIndex = Number(event.name) - 1;
        seq.setTune(tuneAt(tuneIndex));
      }
    }
  };
  stdin.on('data', onData);

  const frameMs = (FRAMES / SAMPLE_RATE) * 1000;
  const pcm = new Int16Array(FRAMES * CHANNELS);

  try {
    while (running) {
      const tickStart = performance.now();
      const frame = seq.fill(pcm);
      out.write(pcm);

      const backend =
        out.backendKind === 'spawn' && out.spawnTool !== undefined
          ? `${out.backendKind} (${out.spawnTool})`
          : out.backendKind;
      const bar = meter(frame.progress, 28);
      const state = frame.paused ? 'paused' : 'playing';
      stdout.write('\x1b[H\x1b[2K');
      stdout.write(`\x1b[38;5;245mmelody\x1b[0m  ${backend}  ${state}\n`);
      stdout.write(`\x1b[2K${frame.title}  ·  ${frame.source}\n`);
      stdout.write(`\x1b[2K${frame.pitch.padEnd(4)} ${bar}\n`);
      stdout.write('\x1b[2K1 Ode   2 Twinkle   3 Korobeiniki   space pause   r restart   esc quit');

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

function meter(progress: number, width: number): string {
  const filled = Math.round(Math.max(0, Math.min(1, progress)) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
