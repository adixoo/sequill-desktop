import { useEffect, useState } from "react";

/** How often relative times ("5 min ago") move on. */
const TICK_MS = 30_000;

/** The current time, updated every 30 seconds, for showing how long ago things happened. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}
