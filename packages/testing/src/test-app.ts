import { Application } from '@mudah-cli/core';
import { detectCapabilities } from '@mudah-cli/terminal';
import { Output, resolveTheme } from '@mudah-cli/ui';
import { ConsoleKernel, renderError, type CommandModule } from '@mudah-cli/console';

export interface TestAppOptions {
  /** App root containing `mudah.json`. */
  cwd: string;
  /** Extra command modules to register (in addition to discovered ones). */
  commands?: CommandModule[];
  /** Environment map for capability detection. */
  env?: NodeJS.ProcessEnv;
}

/**
 * An in-process test harness around a real Mudah application.
 *
 * ```ts
 * const app = await TestApp.create({ cwd: fixtureApp });
 * const result = await app.dispatch(['hello', 'world']);
 * result.exit(0).outContains('hello world');
 * ```
 *
 * Boot (providers + discovery) happens once per `TestApp`; every
 * `dispatch()` clears the captured output first.
 */
export class TestApp {
  readonly app: Application;
  readonly output: Output;
  private readonly kernel: ConsoleKernel;
  private outBuffer = '';
  private errBuffer = '';
  private booted = false;

  private constructor(app: Application, output: Output, kernel: ConsoleKernel) {
    this.app = app;
    this.output = output;
    this.kernel = kernel;
  }

  static async create(options: TestAppOptions): Promise<TestApp> {
    const caps = detectCapabilities({ env: options.env });
    const app = new Application(options.cwd);
    const output = new Output({
      stream: { write: () => {} },
      errorStream: { write: () => {} },
      theme: resolveTheme(app.manifest.ui?.theme),
      colorLevel: caps.colorLevel,
      unicode: caps.unicode,
      osc9: caps.osc9,
    });
    const kernel = new ConsoleKernel(app, output);
    const testApp = new TestApp(app, output, kernel);

    await app.discoverProviders();
    await app.boot();
    await app.evaluateLazy();

    const modules = [...(await app.discoverCommandModules()), ...(options.commands ?? [])];
    for (const mod of modules) {
      kernel.register(mod);
    }
    testApp.booted = true;
    return testApp;
  }

  /** Captured stdout since the last dispatch. */
  outText(): string {
    return this.outBuffer;
  }

  /** Captured stderr since the last dispatch. */
  errText(): string {
    return this.errBuffer;
  }

  clear(): void {
    this.outBuffer = '';
    this.errBuffer = '';
  }

  /**
   * Dispatch argv in-process. Returns a {@link TestResult} with the exit
   * code and chained assertions. Never throws for expected CLI failures
   * (usage errors, unknown commands) — those become exit codes.
   */
  async dispatch(argv: string[]): Promise<TestResult> {
    if (!this.booted) throw new Error('[testing] TestApp is not ready; use TestApp.create().');
    this.clear();

    // Route output through the buffers for this dispatch.
    this.output.redirect(
      {
        write: (data: string) => {
          this.outBuffer += data;
        },
      },
      {
        write: (data: string) => {
          this.errBuffer += data;
        },
      },
    );

    let code: number;
    try {
      code = await this.kernel.dispatch(argv);
    } catch (error) {
      code = renderError(error, this.output);
    }
    return new TestResult(code, this);
  }
}

/** Chained assertions over a dispatch result. */
export class TestResult {
  constructor(
    readonly code: number,
    private readonly app: TestApp,
  ) {}

  /** Assert the exit code, with full output in the failure message. */
  exit(expected: number): this {
    if (this.code !== expected) {
      throw new Error(
        `[testing] Expected exit code ${expected}, got ${this.code}.\n--- stdout ---\n${this.app.outText()}\n--- stderr ---\n${this.app.errText()}`,
      );
    }
    return this;
  }

  outContains(text: string): this {
    if (!this.app.outText().includes(text)) {
      throw new Error(`[testing] stdout missing "${text}".\n--- stdout ---\n${this.app.outText()}`);
    }
    return this;
  }

  outNotContains(text: string): this {
    if (this.app.outText().includes(text)) {
      throw new Error(`[testing] stdout unexpectedly contains "${text}".\n--- stdout ---\n${this.app.outText()}`);
    }
    return this;
  }

  errContains(text: string): this {
    if (!this.app.errText().includes(text)) {
      throw new Error(`[testing] stderr missing "${text}".\n--- stderr ---\n${this.app.errText()}`);
    }
    return this;
  }

  errNotContains(text: string): this {
    if (this.app.errText().includes(text)) {
      throw new Error(`[testing] stderr unexpectedly contains "${text}".\n--- stderr ---\n${this.app.errText()}`);
    }
    return this;
  }
}
