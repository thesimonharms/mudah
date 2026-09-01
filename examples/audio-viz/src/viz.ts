import { Column, Label, List, Sparkline, type Layout } from '@mudah-cli/mudah/tui';

const BANDS = ['idle', 'pulse', 'beat'] as const;

function samples(energy: number): number[] {
  return Array.from({ length: 24 }, (_, i) => {
    const wave = 0.5 + 0.5 * Math.sin((i / 24) * Math.PI * 2);
    return wave * energy;
  });
}

/**
 * Audio ↔ sparkline desk. Energy is stubbed (no OS mixer required).
 * Enter on a band stores `result`.
 */
export class AudioViz {
  result: string | undefined;
  energy = 0.45;
  readonly root: Layout;
  private readonly spark: Sparkline;
  private readonly energyLabel: Label;
  private readonly list: List;

  constructor() {
    this.spark = new Sparkline(samples(this.energy));
    this.energyLabel = new Label(`energy ${this.energy.toFixed(2)}`);
    this.list = new List([...BANDS], (index) => {
      const band = BANDS[index];
      this.result = band;
      this.setEnergy(band === 'idle' ? 0.15 : band === 'pulse' ? 0.55 : 0.95);
    });
    this.root = new Column().add(
      new Label('audio-viz'),
      this.energyLabel,
      this.spark,
      this.list,
    );
  }

  setEnergy(value: number): void {
    this.energy = value;
    this.energyLabel.setText(`energy ${this.energy.toFixed(2)}`);
    this.spark.setValues(samples(this.energy));
  }
}
