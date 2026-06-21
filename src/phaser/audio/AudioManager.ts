export type SemanticAudioCue =
  | 'home_clock'
  | 'rain_bell'
  | 'life_memory'
  | 'return_hum'
  | 'ending_warmth'
  | 'soft_feedback';

export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  async unlock(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.context.currentTime, 0.04);
    }
  }

  play(cue: SemanticAudioCue): void {
    if (!this.context || !this.master || this.muted) return;
    const patterns: Record<SemanticAudioCue, Array<[number, number, number, OscillatorType]>> = {
      home_clock: [[440, 0.05, 0, 'sine']],
      rain_bell: [
        [659, 0.45, 0, 'sine'],
        [659, 0.45, 0.55, 'sine'],
        [784, 0.7, 1.1, 'sine'],
      ],
      life_memory: [
        [261, 0.8, 0, 'triangle'],
        [329, 0.8, 0.08, 'triangle'],
        [392, 0.8, 0.16, 'triangle'],
      ],
      return_hum: [
        [196, 1.2, 0, 'sine'],
        [220, 1.2, 0.25, 'sine'],
      ],
      ending_warmth: [
        [261, 1.4, 0, 'sine'],
        [329, 1.4, 0.12, 'sine'],
        [440, 1.6, 0.24, 'sine'],
      ],
      soft_feedback: [[523, 0.12, 0, 'triangle']],
    };
    for (const [frequency, duration, delay, type] of patterns[cue]) {
      this.tone(frequency, duration, delay, type);
    }
  }

  private tone(frequency: number, duration: number, delay: number, type: OscillatorType): void {
    if (!this.context || !this.master) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(0.08, start + 0.025);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }
}
