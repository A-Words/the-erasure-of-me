export type FullscreenResult = 'entered' | 'exited' | 'unsupported' | 'denied';

type FullscreenListener = (active: boolean) => void;

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface FullscreenDocument extends Document {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
}

interface LockableOrientation {
  lock?: (orientation: 'landscape') => Promise<void>;
}

export class FullscreenController {
  private readonly listeners = new Set<FullscreenListener>();

  constructor(
    private readonly target: FullscreenElement,
    private readonly documentRef: FullscreenDocument = document,
    private readonly orientation: LockableOrientation | undefined = typeof screen === 'undefined'
      ? undefined
      : (screen.orientation as unknown as LockableOrientation | undefined),
  ) {
    this.documentRef.addEventListener('fullscreenchange', this.handleChange);
    this.documentRef.addEventListener('webkitfullscreenchange', this.handleChange);
  }

  isSupported(): boolean {
    return Boolean(
      this.documentRef.fullscreenEnabled ||
      this.documentRef.webkitFullscreenEnabled ||
      this.target.requestFullscreen ||
      this.target.webkitRequestFullscreen,
    );
  }

  isActive(): boolean {
    return Boolean(this.documentRef.fullscreenElement || this.documentRef.webkitFullscreenElement);
  }

  async request(): Promise<FullscreenResult> {
    if (this.isActive()) return 'entered';
    const request = this.target.requestFullscreen
      ? () => this.target.requestFullscreen({ navigationUI: 'hide' })
      : this.target.webkitRequestFullscreen
        ? () => this.target.webkitRequestFullscreen!()
        : null;
    if (!request) return 'unsupported';
    try {
      await request();
      if (!this.isActive()) return 'denied';
      try {
        await this.orientation?.lock?.('landscape');
      } catch {
        // Fullscreen remains usable when orientation locking is unavailable or denied.
      }
      return 'entered';
    } catch {
      return 'denied';
    }
  }

  async exit(): Promise<FullscreenResult> {
    if (!this.isActive()) return 'exited';
    const exit = this.documentRef.exitFullscreen
      ? () => this.documentRef.exitFullscreen()
      : this.documentRef.webkitExitFullscreen
        ? () => this.documentRef.webkitExitFullscreen!()
        : null;
    if (!exit) return 'unsupported';
    try {
      await exit();
      return this.isActive() ? 'denied' : 'exited';
    } catch {
      return 'denied';
    }
  }

  subscribe(listener: FullscreenListener): () => void {
    this.listeners.add(listener);
    listener(this.isActive());
    return () => this.listeners.delete(listener);
  }

  private readonly handleChange = (): void => {
    const active = this.isActive();
    for (const listener of this.listeners) listener(active);
  };
}
