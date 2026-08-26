export interface SpinnerStyle {
  /** One frame per entry, cycled in order. */
  readonly frames: readonly string[];
  /** Milliseconds per frame. */
  readonly interval: number;
}

export const spinnerStyles: Record<string, SpinnerStyle> = {
  /** Braille dots — the classic busy indicator. */
  dots: {
    frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    interval: 80,
  },
  /** A slim vertical meter. */
  meter: {
    frames: ['▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'],
    interval: 80,
  },
  /** Three-dot pulse. */
  pulse: {
    frames: ['·', '•', '●', '•'],
    interval: 120,
  },
  /** ASCII fallback for terminals without unicode. */
  ascii: {
    frames: ['|', '/', '-', '\\'],
    interval: 120,
  },
};

export const defaultSpinner: SpinnerStyle = spinnerStyles['dots'] ?? { frames: ['·'], interval: 100 };
