import {
  KeyParser,
  detectCapabilities,
  disableKittyKeyboard,
  enableKittyKeyboard,
  enterRawMode,
  type OscWriter,
} from '@mudah-cli/terminal';
import { ShaderSession } from '@mudah-cli/vgpu';
import { SHADERS } from './shaders.js';

const FPS = 30;

export async function runPlayground(
  stdout: OscWriter & { columns?: number; rows?: number; isTTY?: boolean },
  stdin: NodeJS.ReadStream,
): Promise<number> {
  const caps = detectCapabilities({ isTty: stdout.isTTY === true });
  if (!caps.isTty) {
    stdout.write('shader-lab needs a TTY. Run it in Ghostty, Kitty, or WezTerm.\n');
    return 1;
  }

  const columns = stdout.columns ?? caps.width;
  const rows = stdout.rows ?? caps.height;
  const hudRows = 2;
  const viewRows = Math.max(4, rows - hudRows);

  const useKitty = caps.kittyGraphics;
  const width = useKitty ? 320 : columns;
  const height = useKitty ? 180 : viewRows * 2;

  let index = 0;
  let energy = 0;
  let holding = false;
  let running = true;
  let code = 0;

  const open = async (shaderIndex: number): Promise<ShaderSession> => {
    const def = SHADERS[shaderIndex]!;
    return ShaderSession.create({
      shader: def.source,
      width,
      height,
      adapter: 'auto',
      present: useKitty ? 'kitty' : 'half',
      stdout,
      set: { params: { time: 0, energy: 0, width, height } },
      label: def.id,
    });
  };

  let session = await open(0);

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
      if (event.name === 'left' || event.name === 'p') {
        index = (index + SHADERS.length - 1) % SHADERS.length;
      } else if (event.name === 'right' || event.name === 'n' || event.name === 'enter') {
        index = (index + 1) % SHADERS.length;
      } else if (event.name === '1') index = 0;
      else if (event.name === '2') index = Math.min(1, SHADERS.length - 1);
      else if (event.name === '3') index = Math.min(2, SHADERS.length - 1);
    }
  };
  stdin.on('data', onData);

  const started = performance.now();
  let currentShader = 0;

  try {
    while (running) {
      const tickStart = performance.now();
      if (index !== currentShader) {
        currentShader = index;
        const next = SHADERS[currentShader]!;
        session.useShader(next.source, { params: { time: 0, energy, width, height } }, next.id);
      }

      energy += ((holding ? 1 : 0) - energy) * 0.18;
      const time = (performance.now() - started) / 1000;
      session.set({ params: { time, energy, width, height } });
      stdout.write('\x1b[H');
      await session.frame(useKitty ? { columns, rows: viewRows } : {});
      const shader = SHADERS[currentShader]!;
      const mode = useKitty ? 'kitty-graphics' : 'half-block';
      stdout.write(
        `\x1b[${viewRows + 1};1H\x1b[2K\x1b[38;5;245mshader-lab\x1b[0m  ${shader.name}   ${shader.hint}   ${mode}\n\x1b[2K1/2/3 or ←/→ switch   space hold   esc quit`,
      );

      const elapsed = performance.now() - tickStart;
      await sleep(Math.max(0, 1000 / FPS - elapsed));
    }
  } finally {
    stdin.off('data', onData);
    stopRaw();
    session.dispose();
    stdout.write(restore.join(''));
  }
  return code;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
