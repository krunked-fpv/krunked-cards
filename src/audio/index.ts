import type {
  IAudioEngine,
  MusicTrackId,
  RenderSettings,
  SoundKey,
} from '../contracts/index.ts';

// Skeleton barrel replaced exclusively by @audio in Wave 1 & Wave 2.
export class AudioEngine implements IAudioEngine {
  async unlock(): Promise<void> {}
  setSettings(_settings: Pick<RenderSettings, 'masterVolume' | 'musicVolume' | 'sfxVolume'>): void {}
  async setCustomPack(_sounds: Record<SoundKey, string> | null): Promise<void> {}
  setMusicContext(_track: MusicTrackId, _intensity?: number): void {}
  setFireIntensity(_intensity: number): void {}
  playSfx(_key: SoundKey, _opts?: { pitch?: number; volume?: number }): void {}
  update(_dt: number): void {}
  getMode(): 'builtin' | 'custom' {
    return 'builtin';
  }
  dispose(): void {}
}

export function createAudioEngine(): IAudioEngine {
  return new AudioEngine();
}
