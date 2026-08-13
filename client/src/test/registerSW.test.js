import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerServiceWorker } from '@/registerSW';

const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');

function setServiceWorker(value) {
  Object.defineProperty(navigator, 'serviceWorker', { value, configurable: true });
}

afterEach(() => {
  if (originalDescriptor) Object.defineProperty(navigator, 'serviceWorker', originalDescriptor);
  else delete navigator.serviceWorker;
});

describe('registerServiceWorker', () => {
  it('registers /sw.js after the load event', () => {
    const register = vi.fn().mockResolvedValue({});
    setServiceWorker({ register });

    registerServiceWorker();
    expect(register).not.toHaveBeenCalled(); // deferred until load

    window.dispatchEvent(new Event('load'));
    expect(register).toHaveBeenCalledWith('/sw.js');
  });

  it('is a no-op when service workers are unsupported', () => {
    delete navigator.serviceWorker;
    expect(() => registerServiceWorker()).not.toThrow();
    expect(() => window.dispatchEvent(new Event('load'))).not.toThrow();
  });
});
