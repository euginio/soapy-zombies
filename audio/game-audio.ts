import { parseStoredMuted } from "../game-rules";

/** Phaser audio cache keys, loaded in BootScene from assets/audio/. */
export const AUDIO_KEYS = {
  music: "music",
  antFall: "ant-fall",
  foodEaten: "food-eaten",
  gameOver: "game-over",
  uiTap: "ui-tap",
  uiToggle: "ui-toggle"
} as const;

export const AUDIO_FILES: Record<string, string> = {
  [AUDIO_KEYS.music]: "./assets/audio/music.ogg",
  [AUDIO_KEYS.antFall]: "./assets/audio/ant-fall.ogg",
  [AUDIO_KEYS.foodEaten]: "./assets/audio/food-eaten.ogg",
  [AUDIO_KEYS.gameOver]: "./assets/audio/game-over.ogg",
  [AUDIO_KEYS.uiTap]: "./assets/audio/ui-tap.ogg",
  [AUDIO_KEYS.uiToggle]: "./assets/audio/ui-toggle.ogg"
};

const MUTED_STORAGE_KEY = "soundMuted";
const MUSIC_VOLUME = 0.35;

/**
 * Small wrapper over Phaser's global sound manager. The manager belongs to the game, not to a
 * scene, so the music keeps playing across scene restarts and is never created twice.
 * Browsers keep audio locked until a user gesture; Phaser unlocks it on the first tap, which
 * happens on the title screen before the game scene asks for sound.
 */
export class GameAudio {
  // Tracked here because the Web Audio manager derives its mute getter from a gain node,
  // which is not a dependable source of truth for the button state.
  private isMuted = false;

  constructor(private readonly sound: Phaser.Sound.BaseSoundManager) {}

  /** Applies the saved mute preference. */
  restoreMute() {
    this.isMuted = this.loadMuted();
    this.sound.mute = this.isMuted;
  }

  get muted(): boolean {
    return this.isMuted;
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    // Unmute first so the confirmation click is audible; muting stays silent.
    this.sound.mute = this.isMuted;
    if (!this.isMuted) {
      this.play(AUDIO_KEYS.uiToggle);
    }
    this.saveMuted(this.isMuted);
    return this.isMuted;
  }

  play(key: string) {
    if (this.sound.locked || !this.sound.game.cache.audio.exists(key)) {
      return;
    }
    this.sound.play(key);
  }

  startMusic() {
    if (!this.sound.game.cache.audio.exists(AUDIO_KEYS.music)) {
      return;
    }
    const music = this.sound.get(AUDIO_KEYS.music)
      ?? this.sound.add(AUDIO_KEYS.music, { loop: true, volume: MUSIC_VOLUME });
    if (music.isPaused) {
      music.resume();
    } else if (!music.isPlaying) {
      music.play();
    }
  }

  pauseMusic() {
    const music = this.sound.get(AUDIO_KEYS.music);
    if (music?.isPlaying) {
      music.pause();
    }
  }

  private loadMuted(): boolean {
    try {
      return parseStoredMuted(localStorage.getItem(MUTED_STORAGE_KEY));
    } catch (error) {
      console.warn("Could not read the mute preference from localStorage", error);
      return false;
    }
  }

  private saveMuted(muted: boolean) {
    try {
      localStorage.setItem(MUTED_STORAGE_KEY, muted ? "1" : "0");
    } catch (error) {
      console.warn("Could not save the mute preference to localStorage", error);
    }
  }
}
