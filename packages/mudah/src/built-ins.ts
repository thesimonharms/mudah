import { parseSignature, type CommandModule, type ConsoleKernel } from '@mudah-cli/console';

type BuiltinLoader = (kernel: ConsoleKernel) => Promise<CommandModule>;

interface FrameworkBuiltin {
  readonly name: string;
  readonly load: BuiltinLoader;
}

function wrapDefault(load: () => Promise<CommandModule>): BuiltinLoader {
  return async () => load();
}

const FRAMEWORK_BUILTINS: readonly FrameworkBuiltin[] = [
  { name: 'make', load: wrapDefault(() => import('./commands/make.command.js')) },
  { name: 'build', load: wrapDefault(() => import('./commands/build.command.js')) },
  { name: 'doctor', load: wrapDefault(() => import('./commands/doctor.command.js')) },
  { name: 'config:show', load: wrapDefault(() => import('./commands/config.show.command.js')) },
  { name: 'config:diff', load: wrapDefault(() => import('./commands/config.diff.command.js')) },
  { name: 'info', load: wrapDefault(() => import('./commands/info.command.js')) },
  { name: 'config:set', load: wrapDefault(() => import('./commands/config.set.command.js')) },
  { name: 'config:source', load: wrapDefault(() => import('./commands/config.source.command.js')) },
  { name: 'config:validate', load: wrapDefault(() => import('./commands/config.validate.command.js')) },
  {
    name: 'dev',
    load: async (kernel) => {
      const { default: DevCommand } = await import('./commands/dev.command.js');
      return {
        default: class extends DevCommand {
          constructor() {
            super(kernel);
          }
        },
      };
    },
  },
  { name: 'plugins:list', load: wrapDefault(() => import('./commands/plugins.list.command.js')) },
  { name: 'plugins:update', load: wrapDefault(() => import('./commands/plugins.update.command.js')) },
  { name: 'plugins:watch', load: wrapDefault(() => import('./commands/plugins.watch.command.js')) },
  { name: 'cache', load: wrapDefault(() => import('./commands/cache.command.js')) },
  { name: 'graph', load: wrapDefault(() => import('./commands/graph.command.js')) },
  { name: 'autocomplete', load: wrapDefault(() => import('./commands/autocomplete.command.js')) },
  {
    name: 'complete',
    load: async (kernel) => {
      const { default: CompleteCommand } = await import('./commands/complete.command.js');
      return {
        default: class extends CompleteCommand {
          constructor() {
            super(kernel);
          }
        },
      };
    },
  },
  {
    name: 'watch',
    load: async (kernel) => {
      const { default: WatchCommand } = await import('./commands/watch.command.js');
      return {
        default: class extends WatchCommand {
          constructor() {
            super(kernel);
          }
        },
      };
    },
  },
  { name: 'tutorial', load: wrapDefault(() => import('./commands/tutorial.command.js')) },
  { name: 'lsp', load: wrapDefault(() => import('./commands/lsp.command.js')) },
  { name: 'replay', load: wrapDefault(() => import('./commands/replay.command.js')) },
  { name: 'test', load: wrapDefault(() => import('./commands/test.command.js')) },
  { name: 'storybook', load: wrapDefault(() => import('./commands/storybook.command.js')) },
  { name: 'docs:widgets', load: wrapDefault(() => import('./commands/docs.widgets.command.js')) },
];

const VALUE_FLAGS = new Set(['--debounce', '--speed', '--cols', '--rows', '--format', '--to']);

/** First argv token that is not a flag. Used to load `watch`/`dev` targets. */
export function firstNonFlag(tokens: readonly string[]): string | undefined {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.startsWith('--') && token.includes('=')) continue;
    if (token.startsWith('-')) {
      if (VALUE_FLAGS.has(token)) i += 1;
      continue;
    }
    return token;
  }
  return undefined;
}

function nameTaken(seen: Set<string>, name: string): boolean {
  if (seen.has(name)) return true;
  const prefix = `${name}:`;
  for (const existing of seen) {
    if (existing.startsWith(prefix)) return true;
  }
  return false;
}

function registerIfFree(kernel: ConsoleKernel, seen: Set<string>, module: CommandModule): void {
  try {
    const name = parseSignature(new module.default().signature ?? '').name;
    if (name === '' || nameTaken(seen, name)) return;
    seen.add(name);
    kernel.register(module);
  } catch {
    // Signature-less modules are skipped; kernel.register throws elsewhere.
  }
}

async function registerMatching(kernel: ConsoleKernel, seen: Set<string>, token: string): Promise<void> {
  for (const spec of FRAMEWORK_BUILTINS) {
    if (spec.name !== token && !spec.name.startsWith(`${token}:`)) continue;
    if (nameTaken(seen, spec.name)) continue;
    registerIfFree(kernel, seen, await spec.load(kernel));
  }
}

async function registerAllFrameworkBuiltIns(kernel: ConsoleKernel, seen: Set<string>): Promise<void> {
  for (const spec of FRAMEWORK_BUILTINS) {
    if (nameTaken(seen, spec.name)) continue;
    registerIfFree(kernel, seen, await spec.load(kernel));
  }
}

/**
 * Register framework commands the current argv needs.
 * Help and completion load every remaining name. A normal command loads
 * only that name (and `watch`/`dev` also load their target).
 */
export async function registerWantedFrameworkBuiltIns(
  kernel: ConsoleKernel,
  seen: Set<string>,
  argv: readonly string[],
  listing: boolean,
): Promise<void> {
  if (listing) {
    await registerAllFrameworkBuiltIns(kernel, seen);
    return;
  }
  const first = argv[0];
  if (first === undefined) {
    await registerAllFrameworkBuiltIns(kernel, seen);
    return;
  }
  await registerMatching(kernel, seen, first);
  if (first === 'watch' || first === 'dev') {
    const target = firstNonFlag(argv.slice(1));
    if (target !== undefined) await registerMatching(kernel, seen, target);
  }
}
