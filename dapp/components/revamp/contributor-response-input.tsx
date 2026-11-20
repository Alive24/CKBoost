"use client";

import { useCallback, useEffect, useRef, type ComponentProps } from "react";
import { RevampTextarea } from "./ui";

/** Preserve the design's 112px empty editor / 60px submitted minimum, while
 * letting real longer responses and narrower viewports increase its height. */
export function ContributorResponseTextarea({compact = false, value, ...props}: ComponentProps<typeof RevampTextarea> & {compact?: boolean}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.max(compact ? 60 : 112, element.scrollHeight + 2)}px`;
  }, [compact]);
  useEffect(resize, [resize, value]);
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent || typeof ResizeObserver === "undefined") return;
    let width = parent.clientWidth;
    const observer = new ResizeObserver(() => {
      if (parent.clientWidth !== width) {width = parent.clientWidth; resize();}
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [resize]);
  return <RevampTextarea {...props} ref={ref} value={value}/>;
}
