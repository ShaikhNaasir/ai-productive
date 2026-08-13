import '@testing-library/jest-dom';

// jsdom lacks matchMedia; stub it for components that may query it.
if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

// jsdom lacks ResizeObserver; recharts' ResponsiveContainer needs it.
if (!global.ResizeObserver) {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
