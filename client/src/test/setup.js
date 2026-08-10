import '@testing-library/jest-dom';

// jsdom lacks matchMedia; stub it for components that may query it.
if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}
