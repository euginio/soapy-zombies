/**
 * @author       Eugenio Arosteguy <eugenio.arosteguy@gmail.com>
 * @description  Screen Wake Lock service to keep the display awake during tilt gameplay.
 */

export interface WakeLockSentinelLike {
  readonly released: boolean;
  readonly type: string;
  release(): Promise<void>;
  addEventListener(type: string, listener: (event?: any) => void): void;
  removeEventListener(type: string, listener: (event?: any) => void): void;
}

export interface WakeLockNavigatorLike {
  wakeLock?: {
    request(type: "screen"): Promise<WakeLockSentinelLike>;
  };
}

export interface WakeLockDocumentLike {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: string, listener: (event?: any) => void): void;
  removeEventListener(type: string, listener: (event?: any) => void): void;
}

export interface WakeLockWindowLike {
  addEventListener(type: string, listener: (event?: any) => void, options?: any): void;
  removeEventListener(type: string, listener: (event?: any) => void): void;
}

export class ScreenWakeLock {
  private sentinel: WakeLockSentinelLike | null = null;
  private isEnabled = false;
  private pendingRequest: Promise<boolean> | null = null;
  private onVisibilityChangeBound: (() => void) | null = null;
  private onUserInteractionBound: (() => void) | null = null;
  private onSentinelReleaseBound: (() => void) | null = null;

  constructor(
    private readonly navProvider: () => WakeLockNavigatorLike | undefined = () =>
      typeof navigator !== "undefined" ? (navigator as WakeLockNavigatorLike) : undefined,
    private readonly docProvider: () => WakeLockDocumentLike | undefined = () =>
      typeof document !== "undefined" ? (document as WakeLockDocumentLike) : undefined,
    private readonly winProvider: () => WakeLockWindowLike | undefined = () =>
      typeof window !== "undefined" ? (window as WakeLockWindowLike) : undefined
  ) {
    this.onVisibilityChangeBound = () => this.handleVisibilityChange();
    this.onUserInteractionBound = () => this.handleUserInteraction();
    this.onSentinelReleaseBound = () => this.handleSentinelRelease();
  }

  get isLocked(): boolean {
    return Boolean(this.sentinel && !this.sentinel.released);
  }

  get active(): boolean {
    return this.isEnabled;
  }

  async acquire(): Promise<boolean> {
    this.isEnabled = true;
    this.attachListeners();
    return await this.requestLock();
  }

  release(): void {
    this.isEnabled = false;
    this.detachListeners();
    this.releaseLock();
  }

  async requestLock(): Promise<boolean> {
    if (!this.isEnabled) {
      return false;
    }
    if (this.isLocked) {
      return true;
    }
    if (this.pendingRequest) {
      return await this.pendingRequest;
    }

    const doc = this.docProvider();
    if (doc && doc.visibilityState !== "visible") {
      return false;
    }

    const nav = this.navProvider();
    if (!nav?.wakeLock?.request) {
      return false;
    }

    this.pendingRequest = (async () => {
      try {
        const sentinel = await nav.wakeLock.request("screen");
        if (!this.isEnabled) {
          sentinel.release().catch(() => {});
          return false;
        }
        this.sentinel = sentinel;
        sentinel.addEventListener("release", this.onSentinelReleaseBound);
        return true;
      } catch {
        return false;
      } finally {
        this.pendingRequest = null;
      }
    })();

    return await this.pendingRequest;
  }

  private releaseLock(): void {
    if (this.sentinel) {
      const lock = this.sentinel;
      this.sentinel = null;
      if (this.onSentinelReleaseBound) {
        lock.removeEventListener("release", this.onSentinelReleaseBound);
      }
      try {
        lock.release().catch(() => {});
      } catch {}
    }
  }

  private handleSentinelRelease(): void {
    this.sentinel = null;
    const doc = this.docProvider();
    if (this.isEnabled && doc?.visibilityState === "visible") {
      this.requestLock().catch(() => {});
    }
  }

  private handleVisibilityChange(): void {
    const doc = this.docProvider();
    if (this.isEnabled && doc?.visibilityState === "visible") {
      this.requestLock().catch(() => {});
    }
  }

  private handleUserInteraction(): void {
    if (this.isEnabled && !this.isLocked) {
      this.requestLock().catch(() => {});
    }
  }

  private attachListeners(): void {
    const doc = this.docProvider();
    if (doc && this.onVisibilityChangeBound) {
      doc.addEventListener("visibilitychange", this.onVisibilityChangeBound);
    }
    const win = this.winProvider();
    if (win && this.onUserInteractionBound) {
      win.addEventListener("pointerdown", this.onUserInteractionBound, { passive: true });
      win.addEventListener("touchstart", this.onUserInteractionBound, { passive: true });
    }
  }

  private detachListeners(): void {
    const doc = this.docProvider();
    if (doc && this.onVisibilityChangeBound) {
      doc.removeEventListener("visibilitychange", this.onVisibilityChangeBound);
    }
    const win = this.winProvider();
    if (win && this.onUserInteractionBound) {
      win.removeEventListener("pointerdown", this.onUserInteractionBound);
      win.removeEventListener("touchstart", this.onUserInteractionBound);
    }
  }
}

export const screenWakeLock = new ScreenWakeLock();
