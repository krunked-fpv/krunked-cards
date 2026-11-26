// ============================================================================
// Krunked Cards — Audio Subsystem Barrel (src/audio/index.ts)
// ============================================================================

export { AudioEngine, createAudioEngine, MAX_SFX_VOICES } from './AudioEngine.ts';
export { MusicSequencer } from './MusicSequencer.ts';
export {
  SynthBank,
  SYNTH_HANDLERS,
  createNoiseLibrary,
  type ActiveVoice,
  type NoiseLibrary,
  type SynthHandler,
  type SynthPlayContext,
} from './SynthBank.ts';
