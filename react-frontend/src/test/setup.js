import '@testing-library/jest-dom';

// Polyfill localStorage para jsdom
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Suprimir advertencias de console.error esperadas en tests
const originalConsoleError = console.error;
console.error = (...args) => {
  const msg = args[0];
  if (
    typeof msg === 'string' &&
    (msg.includes('Warning: ReactDOM.render') ||
      msg.includes('act(...)') ||
      msg.includes('Not implemented'))
  ) {
    return;
  }
  originalConsoleError(...args);
};
