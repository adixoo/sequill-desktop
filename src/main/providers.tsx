import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

const loadMotionFeatures = () => import("@/shared/lib/motion-features").then((m) => m.default);

/** App-wide providers. Data providers live in each page's shell; the theme needs none. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
