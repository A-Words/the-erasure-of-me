import { describe, expect, it, vi } from 'vitest';
import { FullscreenController } from '../../src/ui/FullscreenController';

class FakeDocument extends EventTarget {
  fullscreenEnabled = true;
  fullscreenElement: Element | null = null;
  webkitFullscreenElement: Element | null = null;
  exitFullscreen = vi.fn(async () => {
    this.fullscreenElement = null;
    this.dispatchEvent(new Event('fullscreenchange'));
  });
}

function createHarness() {
  const documentRef = new FakeDocument();
  const target = {
    requestFullscreen: vi.fn(async () => {
      documentRef.fullscreenElement = target as unknown as Element;
      documentRef.dispatchEvent(new Event('fullscreenchange'));
    }),
  } as unknown as HTMLElement;
  const orientation = { lock: vi.fn(async () => undefined) };
  const controller = new FullscreenController(
    target,
    documentRef as unknown as Document,
    orientation,
  );
  return { controller, documentRef, orientation, target };
}

describe('FullscreenController', () => {
  it('enters fullscreen, locks landscape, and emits the active state', async () => {
    const { controller, orientation, target } = createHarness();
    const listener = vi.fn();
    controller.subscribe(listener);

    await expect(controller.request()).resolves.toBe('entered');

    expect(target.requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' });
    expect(orientation.lock).toHaveBeenCalledWith('landscape');
    expect(listener).toHaveBeenLastCalledWith(true);
  });

  it('does not repeat a request while fullscreen is already active', async () => {
    const { controller, target } = createHarness();
    await controller.request();

    await expect(controller.request()).resolves.toBe('entered');

    expect(target.requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('keeps a successful fullscreen result when orientation locking fails', async () => {
    const { controller, orientation } = createHarness();
    orientation.lock.mockRejectedValueOnce(new Error('lock denied'));

    await expect(controller.request()).resolves.toBe('entered');
  });

  it('returns denied when the browser rejects the request', async () => {
    const { controller, target } = createHarness();
    vi.mocked(target.requestFullscreen).mockRejectedValueOnce(new Error('denied'));

    await expect(controller.request()).resolves.toBe('denied');
  });

  it('supports WebKit-prefixed entry and exit', async () => {
    const documentRef = new FakeDocument();
    documentRef.fullscreenEnabled = false;
    const target = {
      webkitRequestFullscreen: vi.fn(() => {
        documentRef.webkitFullscreenElement = target as unknown as Element;
        documentRef.dispatchEvent(new Event('webkitfullscreenchange'));
      }),
    } as unknown as HTMLElement;
    const webkitExitFullscreen = vi.fn(() => {
      documentRef.webkitFullscreenElement = null;
      documentRef.dispatchEvent(new Event('webkitfullscreenchange'));
    });
    Object.assign(documentRef, { exitFullscreen: undefined, webkitExitFullscreen });
    const controller = new FullscreenController(target, documentRef as unknown as Document);

    await expect(controller.request()).resolves.toBe('entered');
    await expect(controller.exit()).resolves.toBe('exited');

    expect(webkitExitFullscreen).toHaveBeenCalledOnce();
  });

  it('returns unsupported when neither fullscreen API is available', async () => {
    const documentRef = new FakeDocument();
    documentRef.fullscreenEnabled = false;
    Object.assign(documentRef, { exitFullscreen: undefined });
    const controller = new FullscreenController(
      {} as HTMLElement,
      documentRef as unknown as Document,
    );

    expect(controller.isSupported()).toBe(false);
    await expect(controller.request()).resolves.toBe('unsupported');
  });
});
