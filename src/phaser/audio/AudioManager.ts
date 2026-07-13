import type {
  AccessibilitySettings,
  AudioBus,
  ChapterId,
  DegradationStage,
} from '../../game/state/GameState';

export type SemanticAudioCue =
  | 'home_clock'
  | 'rain_bell'
  | 'life_memory'
  | 'return_hum'
  | 'ending_warmth'
  | 'rain_stone_1'
  | 'rain_stone_2'
  | 'rain_stone_3'
  | 'rain_wayfinder'
  | 'life_object_returned'
  | 'return_path_step'
  | 'return_junction'
  | 'memory_recalled'
  | 'ending_handshake'
  | 'soft_feedback';

export type SemanticAudioNote = readonly [
  frequency: number,
  duration: number,
  delay: number,
  type: OscillatorType,
];

export interface SemanticAudioPattern {
  readonly bus: AudioBus;
  readonly level: number;
  readonly notes: readonly SemanticAudioNote[];
}

const semanticAudioPatterns: Record<SemanticAudioCue, SemanticAudioPattern> = {
  home_clock: { bus: 'ambience', level: 0.07, notes: [[440, 0.05, 0, 'sine']] },
  rain_bell: {
    bus: 'sfx',
    level: 0.07,
    notes: [
      [659, 0.45, 0, 'sine'],
      [659, 0.45, 0.55, 'sine'],
      [784, 0.7, 1.1, 'sine'],
    ],
  },
  life_memory: {
    bus: 'music',
    level: 0.07,
    notes: [
      [261.63, 0.8, 0, 'triangle'],
      [329.63, 0.8, 0.08, 'triangle'],
      [392, 0.8, 0.16, 'triangle'],
    ],
  },
  return_hum: {
    bus: 'voice',
    level: 0.07,
    notes: [
      [196, 1.2, 0, 'sine'],
      [220, 1.2, 0.25, 'sine'],
    ],
  },
  ending_warmth: {
    bus: 'voice',
    level: 0.07,
    notes: [
      [220, 1.4, 0, 'sine'],
      [246.94, 1.4, 0.22, 'sine'],
    ],
  },
  rain_stone_1: {
    bus: 'sfx',
    level: 0.045,
    notes: [
      [146.83, 0.34, 0, 'sine'],
      [523.25, 0.34, 0.08, 'sine'],
      [659.25, 0.5, 0.19, 'sine'],
    ],
  },
  rain_stone_2: {
    bus: 'sfx',
    level: 0.045,
    notes: [
      [146.83, 0.34, 0, 'sine'],
      [587.33, 0.34, 0.08, 'sine'],
      [698.46, 0.5, 0.19, 'sine'],
    ],
  },
  rain_stone_3: {
    bus: 'sfx',
    level: 0.048,
    notes: [
      [146.83, 0.34, 0, 'sine'],
      [659.25, 0.34, 0.08, 'sine'],
      [783.99, 0.56, 0.19, 'sine'],
    ],
  },
  rain_wayfinder: {
    bus: 'sfx',
    level: 0.042,
    notes: [
      [130.81, 0.36, 0, 'sine'],
      [587.33, 0.4, 0.12, 'sine'],
      [880, 0.62, 0.26, 'sine'],
    ],
  },
  life_object_returned: {
    bus: 'sfx',
    level: 0.04,
    notes: [
      [130.81, 0.55, 0, 'sine'],
      [261.63, 0.42, 0.1, 'triangle'],
      [523.25, 0.7, 0.23, 'sine'],
    ],
  },
  return_path_step: {
    bus: 'sfx',
    level: 0.034,
    notes: [
      [98, 0.4, 0, 'sine'],
      [146.83, 0.42, 0.13, 'sine'],
      [196, 0.55, 0.28, 'sine'],
    ],
  },
  return_junction: {
    bus: 'sfx',
    level: 0.04,
    notes: [
      [98, 0.55, 0, 'sine'],
      [164.81, 0.52, 0.12, 'sine'],
      [246.94, 0.75, 0.26, 'sine'],
    ],
  },
  memory_recalled: {
    bus: 'sfx',
    level: 0.04,
    notes: [
      [130.81, 0.55, 0, 'sine'],
      [392, 0.6, 0.14, 'triangle'],
      [659.25, 0.85, 0.3, 'sine'],
    ],
  },
  ending_handshake: {
    bus: 'voice',
    level: 0.034,
    notes: [
      [98, 0.7, 0, 'sine'],
      [146.83, 0.75, 0.16, 'sine'],
      [220, 0.9, 0.36, 'sine'],
    ],
  },
  soft_feedback: { bus: 'sfx', level: 0.07, notes: [[523.25, 0.12, 0, 'triangle']] },
};

export function resolveSemanticAudioPattern(cue: SemanticAudioCue): SemanticAudioPattern {
  const pattern = semanticAudioPatterns[cue];
  return Object.freeze({
    bus: pattern.bus,
    level: pattern.level,
    notes: Object.freeze(
      pattern.notes.map(([frequency, duration, delay, type]) =>
        Object.freeze([frequency, duration, delay, type] as SemanticAudioNote),
      ),
    ),
  });
}

export interface ChapterAudioProfile {
  stage: DegradationStage;
  melody: boolean;
  harmony: boolean;
  drone: boolean;
  rhythm: boolean;
  ambienceFilterHz: number;
  ambienceLevel: number;
}

export const chapterAudioProfiles: Record<ChapterId, ChapterAudioProfile> = {
  home: {
    stage: 'D0',
    melody: true,
    harmony: true,
    drone: true,
    rhythm: true,
    ambienceFilterHz: 2400,
    ambienceLevel: 0.055,
  },
  rain: {
    stage: 'D1',
    melody: true,
    harmony: true,
    drone: true,
    rhythm: true,
    ambienceFilterHz: 1500,
    ambienceLevel: 0.105,
  },
  life: {
    stage: 'D2',
    melody: false,
    harmony: true,
    drone: true,
    rhythm: true,
    ambienceFilterHz: 1100,
    ambienceLevel: 0.06,
  },
  return: {
    stage: 'D3',
    melody: false,
    harmony: true,
    drone: true,
    rhythm: false,
    ambienceFilterHz: 720,
    ambienceLevel: 0.07,
  },
  ending: {
    stage: 'D4',
    melody: false,
    harmony: false,
    drone: true,
    rhythm: false,
    ambienceFilterHz: 900,
    ambienceLevel: 0.035,
  },
};

export function resolveChapterAudioProfile(chapter: ChapterId): ChapterAudioProfile {
  return { ...chapterAudioProfiles[chapter] };
}

export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Partial<Record<AudioBus, GainNode>> = {};
  private settings: AccessibilitySettings | null = null;
  private desiredChapter: ChapterId | null = null;
  private playingChapter: ChapterId | null = null;
  private soundscapeSources: AudioScheduledSourceNode[] = [];
  private themeTimer: number | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  async unlock(): Promise<void> {
    if (!this.context) this.createGraph();
    if (!this.context) return;
    if (this.context.state === 'suspended') await this.context.resume();
    if (this.desiredChapter && this.playingChapter !== this.desiredChapter) {
      this.startSoundscape(this.desiredChapter);
    }
  }

  async suspend(): Promise<void> {
    if (this.context?.state === 'running') await this.context.suspend();
  }

  setSettings(settings: Readonly<AccessibilitySettings>): void {
    this.settings = {
      ...settings,
      audioVolumes: { ...settings.audioVolumes },
    };
    this.applyMix();
  }

  setChapter(chapter: ChapterId | null): void {
    this.desiredChapter = chapter;
    if (!chapter) {
      this.stopSoundscape();
      return;
    }
    if (this.context && this.context.state === 'running' && this.playingChapter !== chapter) {
      this.startSoundscape(chapter);
    }
  }

  play(cue: SemanticAudioCue): void {
    if (!this.context || !this.master || this.settings?.muted) return;
    const pattern = resolveSemanticAudioPattern(cue);
    for (const [frequency, duration, delay, type] of pattern.notes) {
      this.tone(pattern.bus, frequency, duration, delay, type, pattern.level);
    }
  }

  private createGraph(): void {
    const audioGlobal = globalThis as typeof globalThis & {
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioContextConstructor = audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext;
    if (!AudioContextConstructor) return;
    this.context = new AudioContextConstructor();
    this.master = this.context.createGain();
    this.master.connect(this.context.destination);
    for (const bus of ['music', 'ambience', 'voice', 'sfx'] as const) {
      const gain = this.context.createGain();
      gain.connect(this.master);
      this.buses[bus] = gain;
    }
    this.applyMix();
  }

  private applyMix(): void {
    if (!this.context || !this.master || !this.settings) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : 0.7, now, 0.04);
    for (const bus of ['music', 'ambience', 'voice', 'sfx'] as const) {
      const level = Math.max(0, Math.min(1, this.settings.audioVolumes[bus]));
      this.buses[bus]?.gain.setTargetAtTime(level * level, now, 0.04);
    }
  }

  private startSoundscape(chapter: ChapterId): void {
    if (!this.context || this.context.state !== 'running') return;
    this.stopSoundscape();
    this.playingChapter = chapter;
    this.startAmbience(chapter);
    this.scheduleThemeCycle(chapter);
    this.themeTimer = window.setInterval(() => this.scheduleThemeCycle(chapter), 8000);
    const entryCue: Record<ChapterId, SemanticAudioCue> = {
      home: 'home_clock',
      rain: 'rain_bell',
      life: 'life_memory',
      return: 'return_hum',
      ending: 'ending_warmth',
    };
    this.play(entryCue[chapter]);
  }

  private stopSoundscape(): void {
    if (this.themeTimer !== null) {
      window.clearInterval(this.themeTimer);
      this.themeTimer = null;
    }
    for (const source of this.soundscapeSources) {
      try {
        source.stop();
      } catch {
        // A scheduled source may already have ended; stopping it is best-effort cleanup.
      }
    }
    this.soundscapeSources = [];
    this.playingChapter = null;
  }

  private startAmbience(chapter: ChapterId): void {
    if (!this.context || !this.buses.ambience) return;
    const profile = resolveChapterAudioProfile(chapter);
    const source = this.context.createBufferSource();
    source.buffer = this.getNoiseBuffer();
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = chapter === 'rain' ? 'bandpass' : 'lowpass';
    filter.frequency.value = profile.ambienceFilterHz;
    filter.Q.value = chapter === 'rain' ? 0.7 : 0.35;
    const gain = this.context.createGain();
    gain.gain.value = profile.ambienceLevel;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.buses.ambience);
    source.start();
    this.soundscapeSources.push(source);

    const roomTone = this.context.createOscillator();
    const roomGain = this.context.createGain();
    roomTone.type = 'sine';
    roomTone.frequency.value = chapter === 'return' ? 98 : chapter === 'ending' ? 130.81 : 110;
    roomGain.gain.value = chapter === 'rain' ? 0.008 : 0.014;
    roomTone.connect(roomGain);
    roomGain.connect(this.buses.ambience);
    roomTone.start();
    this.soundscapeSources.push(roomTone);
  }

  private scheduleThemeCycle(chapter: ChapterId): void {
    if (!this.context || this.context.state !== 'running') return;
    const profile = resolveChapterAudioProfile(chapter);
    if (chapter === 'ending') {
      this.tone('voice', 220, 1.3, 0.2, 'sine', 0.025, true);
      this.tone('voice', 246.94, 1.5, 1.8, 'sine', 0.022, true);
      this.tone('voice', 220, 1.8, 3.7, 'sine', 0.02, true);
      return;
    }
    if (profile.melody) {
      [392, 440, 523.25, 440].forEach((note, index) =>
        this.tone('music', note, 0.75, index * 1.35, 'triangle', 0.035, true),
      );
    }
    if (profile.harmony) {
      this.tone('music', 196, 5.8, 0, 'triangle', 0.024, true);
      this.tone('music', 246.94, 5.8, 0.08, 'triangle', 0.02, true);
    }
    if (profile.drone) this.tone('music', 130.81, 6.4, 0, 'sine', 0.018, true);
    if (profile.rhythm) {
      for (let beat = 0; beat < 6; beat += 1) {
        this.tone('music', beat % 2 === 0 ? 880 : 660, 0.045, beat * 0.92, 'sine', 0.018, true);
      }
    }
  }

  private getNoiseBuffer(): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    if (!this.context) throw new Error('Audio context is unavailable');
    const frames = this.context.sampleRate * 4;
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < frames; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.985 + white * 0.015;
      channel[index] = previous;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private tone(
    bus: AudioBus,
    frequency: number,
    duration: number,
    delay: number,
    type: OscillatorType,
    level: number,
    trackSoundscape = false,
  ): void {
    if (!this.context || !this.buses[bus]) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(level, start + 0.035);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(this.buses[bus]);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.04);
    if (trackSoundscape) {
      this.soundscapeSources.push(oscillator);
      oscillator.addEventListener('ended', () => {
        this.soundscapeSources = this.soundscapeSources.filter((source) => source !== oscillator);
      });
    }
  }
}
