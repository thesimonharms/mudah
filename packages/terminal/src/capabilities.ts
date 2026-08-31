export type ColorLevel = 0 | 1 | 8 | 24;

export interface TerminalCapabilities {
  /** Output is attached to a terminal. */
  readonly isTty: boolean;
  /** Color output is enabled. */
  readonly color: boolean;
  /** Effective color level. */
  readonly colorLevel: ColorLevel;
  /** 24-bit truecolor support. */
  readonly trueColor: boolean;
  /** Use unicode box-drawing characters (false falls back to ASCII). */
  readonly unicode: boolean;
  /** Animations/motion are allowed. */
  readonly animations: boolean;
  /** The user (or terminal) requested reduced motion. */
  readonly reducedMotion: boolean;
  /** OSC 9 desktop notifications (Ghostty, WezTerm). */
  readonly osc9: boolean;
  /** OSC 133 semantic prompt markers (Kitty, WezTerm, iTerm2, VS Code, foot). */
  readonly osc133: boolean;
  /** OSC 7 working-directory tracking (cwd announcements). Widely supported; emitted on a TTY. */
  readonly osc7: boolean;
  /**
   * The terminal answers OSC 10/11 color queries, so its theme can be read
   * at runtime. Everything modern does; dumb terminals and CI do not.
   */
  readonly themeQuery: boolean;
  /**
   * Kitty graphics protocol (APC `_G`): pixel images in the terminal.
   * Ghostty, Kitty, and WezTerm.
   */
  readonly kittyGraphics: boolean;
  /**
   * Kitty keyboard protocol (CSI u), including key-up when enabled.
   * Ghostty, Kitty, and WezTerm.
   */
  readonly kittyKeyboard: boolean;
  /** Cursor show/hide is safe. */
  readonly cursorControl: boolean;
  /** Best-guess terminal theme. */
  readonly theme: 'dark' | 'light' | 'unknown';
  readonly width: number;
  readonly height: number;
  /** Detected terminal brand. */
  readonly brand: TerminalBrand;
}

export type TerminalBrand =
  | 'ghostty'
  | 'kitty'
  | 'wezterm'
  | 'alacritty'
  | 'iterm'
  | 'apple-terminal'
  | 'vscode'
  | 'foot'
  | 'xterm'
  | 'unknown';

export interface CapabilityOverrides {
  color?: boolean;
  unicode?: boolean;
  reducedMotion?: boolean;
  theme?: 'dark' | 'light';
}

export interface DetectCapabilitiesOptions {
  isTty?: boolean;
  width?: number;
  height?: number;
  /** Environment map (defaults to `process.env`). */
  env?: NodeJS.ProcessEnv;
  overrides?: CapabilityOverrides;
}

/**
 * Detect terminal capabilities from the environment. Pure function of its
 * options — pass `env` in tests. Explicit overrides win over detection.
 */
export function detectCapabilities(options: DetectCapabilitiesOptions = {}): TerminalCapabilities {
  const env = options.env ?? process.env;
  const isTty = options.isTty ?? process.stdout.isTTY === true;
  const overrides = options.overrides ?? {};

  const brand = detectBrand(env);
  const colorLevel = detectColorLevel(isTty, env);
  const reducedMotion =
    overrides.reducedMotion ?? (env['MUDAH_REDUCED_MOTION'] === '1' || env['NO_ANIMATION'] === '1');

  return {
    isTty,
    color: overrides.color ?? colorLevel > 0,
    colorLevel,
    trueColor: colorLevel === 24,
    unicode: overrides.unicode ?? env['TERM'] !== 'dumb',
    animations: isTty && !reducedMotion && env['CI'] !== 'true' && env['CI'] !== '1',
    reducedMotion,
    osc9: brand === 'ghostty' || brand === 'wezterm',
    osc133:
      brand === 'kitty' || brand === 'wezterm' || brand === 'iterm' || brand === 'vscode' || brand === 'foot',
    osc7: isTty,
    themeQuery: isTty && brand !== 'apple-terminal' && env['TERM'] !== 'dumb',
    kittyGraphics: isTty && (brand === 'ghostty' || brand === 'kitty' || brand === 'wezterm'),
    kittyKeyboard: isTty && (brand === 'ghostty' || brand === 'kitty' || brand === 'wezterm'),
    cursorControl: isTty,
    theme: overrides.theme ?? 'unknown',
    width: options.width ?? process.stdout.columns ?? 80,
    height: options.height ?? process.stdout.rows ?? 24,
    brand,
  };
}

function detectBrand(env: NodeJS.ProcessEnv): TerminalBrand {
  const program = env['TERM_PROGRAM'];
  const term = env['TERM'];
  if (program === 'ghostty' || term === 'xterm-ghostty') return 'ghostty';
  if (program === 'WezTerm' || term === 'xterm-wezterm') return 'wezterm';
  if (term === 'xterm-kitty') return 'kitty';
  if (program === 'iTerm.app') return 'iterm';
  if (program === 'Apple_Terminal') return 'apple-terminal';
  if (program === 'vscode') return 'vscode';
  if (program === 'foot' || term === 'xterm-foot') return 'foot';
  if (term === 'alacritty' || env['ALACRITTY_INSTANCE_ID'] !== undefined) return 'alacritty';
  if (term?.startsWith('xterm')) return 'xterm';
  return 'unknown';
}

function detectColorLevel(isTty: boolean, env: NodeJS.ProcessEnv): ColorLevel {
  if (env['NO_COLOR'] !== undefined) return 0;

  const forced = env['FORCE_COLOR'];
  if (forced !== undefined) {
    if (forced === '' || forced === 'true' || forced === '1') return 8;
    if (forced === '2') return 8;
    if (forced === '3') return 24;
    if (forced === '0' || forced === 'false') return 0;
  }
  if (env['CLICOLOR_FORCE'] === '1') return 8;

  if (!isTty) {
    // CI systems are TTY-less but render color; trust COLORTERM when present.
    if (env['CI'] === 'true' || env['CI'] === '1') {
      return env['COLORTERM'] === 'truecolor' || env['COLORTERM'] === 'yes' ? 24 : 8;
    }
    return 0;
  }

  if (env['COLORTERM'] === 'truecolor' || env['COLORTERM'] === 'yes') return 24;
  if (env['TERM']?.includes('256color')) return 8;
  if (env['TERM']?.includes('color')) return 8;
  return 1;
}
