import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

/**
 * A component whose code downloads the first time it renders, showing `fallback`
 * meanwhile. Keeps heavy pieces (CodeMirror, the CSV parser) out of the first load.
 */
export function lazyComponent<P extends object>(
  load: () => Promise<ComponentType<P>>,
  fallback: ReactNode = null,
): ComponentType<P> {
  const Lazy = lazy(() => load().then((component) => ({ default: component })));
  function LazyComponent(props: P) {
    return (
      <Suspense fallback={fallback}>
        <Lazy {...props} />
      </Suspense>
    );
  }
  return LazyComponent;
}
