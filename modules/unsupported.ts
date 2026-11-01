/**
 * Stand-in for a native module on a platform where it is not built yet (Android: pose + screen recorder
 * are iOS-only until the Kotlin ports land, see plan Phase 9). Every method throws a clear error instead of
 * the app crashing at import time; `addListener` returns a no-op subscription so screens can mount.
 */
export class UnsupportedModuleError extends Error {
  constructor(module: string, method: string) {
    super(`${module}.${method} is not available on this platform yet`);
    this.name = 'UnsupportedModuleError';
  }
}

export function unsupportedModule<T extends object>(name: string, sync: Partial<T> = {}): T {
  return new Proxy({} as T, {
    get(_, prop) {
      if (prop in sync) return (sync as Record<PropertyKey, unknown>)[prop];
      if (prop === 'addListener') return () => ({ remove() {} });
      if (prop === 'removeAllListeners') return () => {};
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      return () => { throw new UnsupportedModuleError(name, String(prop)); };
    },
  });
}
