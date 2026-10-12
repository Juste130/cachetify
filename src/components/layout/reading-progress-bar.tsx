"use client";

import { useEffect, useState } from "react";

/**
 * A long, dense legal document on mobile is an endless scroll with no sense of how much is
 * left — this thin bar under the fixed header gives that back without needing to add a visible
 * "X% read" label anywhere.
 */
export function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="fixed top-16 left-0 right-0 h-1 bg-transparent z-40" aria-hidden="true">
      <div className="h-full bg-[#FFC107] transition-[width] duration-150" style={{ width: `${progress}%` }} />
    </div>
  );
}
