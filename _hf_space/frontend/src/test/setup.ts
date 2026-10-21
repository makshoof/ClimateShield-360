import '@testing-library/jest-dom/vitest';

// ResizeObserver is used by RiskMap
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = ResizeObserverMock;

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

// WebGL probe used by mapHeight / RiskMap.checkWebGLSupport
(window as any).WebGLRenderingContext = (window as any).WebGLRenderingContext || function WebGLRenderingContext() {};
HTMLCanvasElement.prototype.getContext = function getContext(type?: string) {
  if (type === 'webgl' || type === 'experimental-webgl' || type === 'webgl2') {
    return {} as any;
  }
  return null;
} as any;
