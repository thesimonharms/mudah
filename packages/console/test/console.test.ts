import { describe, expect, it } from 'vitest';
import { Application, ServiceProvider, UsageError, type MudahManifest } from '@mudah-cli/core';
import { Output, resolveTheme, type OutputOptions } from '@mudah-cli/ui';
import {
  ArgumentParseError,
  Command,
  ConsoleKernel,
  Prompts,
  formatUsage,
  parseInput,
  parseSignature,
  renderCommandHelp,
  renderCommandList,
} from '@mudah-cli/console';

const manifest: MudahManifest = { name: 'test-app', version: '1.0.0', bin: 'test-app' };

function makeApp(): Application {
  return new Application('/nonexistent', manifest);
}

function makeOutput(): { out: string; output: Output } {
  const holder: { out: string; output: Output } = { out: '', output: null as unknown as Output };
  const base: OutputOptions = {
    stream: { write(data: string): void { holder.out += data; } },
    errorStream: { write(data: string): void { holder.out += data; } },
    theme: resolveTheme('auto'),
    colorLevel: 0,
    unicode: true,
  };
  holder.output = new Output(base);
  return holder;
}

class GreetCommand extends Command {
  signature = 'greet {name?} [--shout]';
  description = 'Say hello';
  async handle() {
    this.output.success(`hello ${this.arg('name') ?? 'world'}${this.option('shout') ? '!!' : ''}`);
  }
}

class NeedCommand extends Command {
  signature = 'need {thing}';
  description = 'Requires an argument';
  async handle() {
    this.output.info(this.arg('thing') ?? '');
  }
}

class CodeCommand extends Command {
  signature = 'code';
  description = 'Returns 3';
  async handle() {
    return 3;
  }
}

class BoomCommand extends Command {
  signature = 'boom';
  description = 'Throws';
  async handle() {
    throw new Error('kaboom');
  }
}

function kernelFor(app: Application, holder: { out: string; output: Output }): ConsoleKernel {
  const kernel = new ConsoleKernel(app, holder.output);
  kernel.register({ default: GreetCommand });
  kernel.register({ default: NeedCommand });
  kernel.register({ default: CodeCommand });
  kernel.register({ default: BoomCommand });
  return kernel;
}

describe('parseSignature', () => {
  it('parses args with optionality and defaults', () => {
    const sig = parseSignature('deploy {branch?} {ref=main}');
    expect(sig.name).toBe('deploy');
    expect(sig.args).toEqual([
      { name: 'branch', optional: true, defaultValue: undefined },
      { name: 'ref', optional: false, defaultValue: 'main' },
    ]);
  });

  it('parses flags and value options', () => {
    const sig = parseSignature('deploy [--force] [--env=production]');
    expect(sig.options).toEqual([
      { name: 'force', takesValue: false, defaultValue: undefined },
      { name: 'env', takesValue: true, defaultValue: 'production' },
    ]);
  });

  it('throws on malformed arguments', () => {
    expect(() => parseSignature('bad {9lives}')).toThrow(/Invalid argument/);
  });
});

describe('parseInput', () => {
  const sig = parseSignature('deploy {branch?} {ref=main} [--force] [--env=production]');

  it('fills positionals, defaults, and option defaults', () => {
    const input = parseInput(sig, ['feature-x']);
    expect(input.args).toEqual({ branch: 'feature-x', ref: 'main' });
    expect(input.options).toEqual({ force: false, env: 'production' });
  });

  it('reads flags and --opt=value', () => {
    const input = parseInput(sig, ['--force', '--env=staging', 'b']);
    expect(input.options).toEqual({ force: true, env: 'staging' });
    expect(input.args.branch).toBe('b');
  });

  it('treats -- as the option terminator', () => {
    const input = parseInput(sig, ['--', '--weird']);
    expect(input.args.branch).toBe('--weird');
  });

  it('rejects unknown options and excess arguments', () => {
    expect(() => parseInput(sig, ['--nope'])).toThrow(ArgumentParseError);
    expect(() => parseInput(sig, ['a', 'b', 'c'])).toThrow(/Too many arguments/);
  });

  it('rejects missing required arguments', () => {
    const need = parseSignature('need {thing}');
    expect(() => parseInput(need, [])).toThrow(/Missing required argument "thing"/);
  });
});

describe('ConsoleKernel', () => {
  it('dispatches to the matching command with parsed input', async () => {
    const app = makeApp();
    const holder = makeOutput();
    const kernel = kernelFor(app, holder);

    const code = await kernel.dispatch(['greet', 'world', '--shout']);
    expect(code).toBe(0);
    expect(holder.out).toContain('hello world!!');
  });

  it('applies optional argument defaults', async () => {
    const app = makeApp();
    const holder = makeOutput();
    const kernel = kernelFor(app, holder);
    await kernel.dispatch(['greet']);
    expect(holder.out).toContain('hello world');
  });

  it('returns custom exit codes', async () => {
    const app = makeApp();
    const holder = makeOutput();
    const kernel = kernelFor(app, holder);
    const code = await kernel.dispatch(['code']);
    expect(code).toBe(3);
  });

  it('throws UsageError for unknown or missing commands', async () => {
    const app = makeApp();
    const holder = makeOutput();
    const kernel = kernelFor(app, holder);
    await expect(kernel.dispatch(['nope'])).rejects.toThrow(UsageError);
    await expect(kernel.dispatch([])).rejects.toThrow(/No command specified/);
  });

  it('maps argument parse failures to UsageError', async () => {
    const app = makeApp();
    const holder = makeOutput();
    const kernel = kernelFor(app, holder);
    await expect(kernel.dispatch(['need'])).rejects.toThrow(UsageError);
    await expect(kernel.dispatch(['need'])).rejects.toThrow(/Missing required argument/);
  });

  it('boots lazy providers for the dispatched command', async () => {
    const app = makeApp();
    let booted = false;
    class GreetLazy extends ServiceProvider {
      boot(): void {
        booted = true;
      }
    }
    app.registerLazy(GreetLazy, { commands: ['greet'] });
    const holder = makeOutput();
    const kernel = kernelFor(app, holder);
    expect(booted).toBe(false);
    await kernel.dispatch(['greet']);
    expect(booted).toBe(true);
  });

  it('emits command.before/after/error lifecycle events', async () => {
    const app = makeApp();
    const holder = makeOutput();
    const kernel = kernelFor(app, holder);

    const events: string[] = [];
    app.events().on('command.before', () => {
      events.push('before');
    });
    app.events().on('command.after', (payload) => {
      events.push(`after:${payload.exitCode}`);
    });
    app.events().on('command.error', () => {
      events.push('error');
    });

    await kernel.dispatch(['code']);
    await expect(kernel.dispatch(['boom'])).rejects.toThrow('kaboom');

    expect(events).toContain('before');
    expect(events).toContain('after:3');
    expect(events).toContain('error');
  });
});

describe('Prompts (forced values)', () => {
  it('returns forced values without touching the TTY', async () => {
    const prompts = new Prompts();
    expect(await prompts.ask('Name?', { forcedValue: 'ada' })).toBe('ada');
    expect(await prompts.confirm('Sure?', { forcedValue: 'y' })).toBe(true);
    expect(await prompts.confirm('Sure?', { forcedValue: 'n' })).toBe(false);
    expect(await prompts.select('Pick', ['a', 'b', 'c'], { forcedValue: '2' })).toBe('b');
    await expect(prompts.select('Pick', ['a'], { forcedValue: '9' })).rejects.toThrow(/out of range/);
  });
});

describe('help rendering', () => {
  it('formats usage strings', async () => {
    const app = makeApp();
    const holder = makeOutput();
    const kernel = kernelFor(app, holder);
    const entry = kernel.get('greet')!;
    expect(formatUsage(entry)).toBe('greet {name?} --shout');
  });

  it('renders a command list and per-command help', () => {
    const entries = [
      {
        name: 'greet',
        signature: parseSignature('greet {name?} [--shout]'),
        description: 'Say hello',
        factory: () => new GreetCommand(),
      },
    ];
    const lines: string[] = [];
    renderCommandList('test-app', '1.0.0', entries, lines);
    expect(lines.join('\n')).toContain('greet');
    expect(lines.join('\n')).toContain('Say hello');
    expect(lines.join('\n')).toContain('test-app v1.0.0');

    const help: string[] = [];
    renderCommandHelp('test-app', entries[0]!, help);
    const text = help.join('\n');
    expect(text).toContain('Usage: test-app greet {name?} --shout');
    expect(text).toContain('Arguments:');
    expect(text).toContain('Options:');
    expect(text).toContain('--help');
  });
});

describe('command aliases & deprecation', () => {
  class ShortCommand extends Command {
    signature = 'short {name?}';
    description = 'Short form';
    aliases = ['s', 'quick'];
    async handle() {
      this.output.success(`short ${this.arg('name') ?? 'x'}`);
    }
  }
  class LegacyCommand extends Command {
    signature = 'legacy';
    description = 'Old thing';
    deprecated = 'use short instead';
    async handle() {
      this.output.success('legacy ran');
    }
  }

  function setupAliases(): { kernel: ConsoleKernel; holder: { out: string; output: Output } } {
    const holder = makeOutput();
    const kernel = new ConsoleKernel(makeApp(), holder.output);
    kernel.register({ default: ShortCommand });
    kernel.register({ default: LegacyCommand });
    return { kernel, holder };
  }

  it('resolves an alias to the canonical command', async () => {
    const { kernel } = setupAliases();
    expect(kernel.has('quick')).toBe(true);
    expect(kernel.get('quick')?.name).toBe('short');
    const code = await kernel.dispatch(['s', 'world']);
    expect(code).toBe(0);
    expect(kernel.get('short')?.aliases).toEqual(['s', 'quick']);
  });

  it('does not duplicate aliases in the command list', () => {
    const { kernel } = setupAliases();
    expect(kernel.list().filter((e) => e.name === 'short')).toHaveLength(1);
  });

  it('warns when running a deprecated command', async () => {
    const { kernel, holder } = setupAliases();
    const code = await kernel.dispatch(['legacy']);
    expect(code).toBe(0);
    expect(holder.out).toContain('deprecated');
    expect(holder.out).toContain('legacy ran');
  });

  it('renders deprecations and aliases in per-command help', () => {
    const { kernel } = setupAliases();
    const short = kernel.get('short')!;
    const legacy = kernel.get('legacy')!;
    const shortHelp: string[] = [];
    renderCommandHelp('app', short, shortHelp);
    const legacyHelp: string[] = [];
    renderCommandHelp('app', legacy, legacyHelp);
    expect(shortHelp.join('\n')).toContain('Aliases:');
    expect(shortHelp.join('\n')).toContain('quick');
    expect(legacyHelp.join('\n')).toContain('Deprecated:');
    expect(legacyHelp.join('\n')).toContain('use short instead');
  });

  it('still rejects unknown commands', async () => {
    const { kernel } = setupAliases();
    await expect(kernel.dispatch(['nope'])).rejects.toThrow(UsageError);
  });
});

describe('command history', () => {
  it('records dispatched argv', async () => {
    const app = makeApp();
    const holder = makeOutput();
    const kernel = kernelFor(app, holder);
    expect(kernel.history).toHaveLength(0);
    await kernel.dispatch(['greet', 'world']);
    expect(kernel.history).toEqual(['greet world']);
    await kernel.dispatch(['greet', 'mars']);
    expect(kernel.history).toEqual(['greet world', 'greet mars']);
  });

  it('clears history', async () => {
    const app = makeApp();
    const holder = makeOutput();
    const kernel = kernelFor(app, holder);
    await kernel.dispatch(['greet']);
    expect(kernel.history).toHaveLength(1);
    kernel.clearHistory();
    expect(kernel.history).toHaveLength(0);
  });

  it('records history even on error exit codes', async () => {
    const app = makeApp();
    const holder = makeOutput();
    const kernel = kernelFor(app, holder);
    await kernel.dispatch(['code']);
    expect(kernel.history).toContain('code');
  });
});
