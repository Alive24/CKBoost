"use client";

import { useId } from "react";

/** Preserve the exact Figma raster glyph. Its opaque white canvas becomes an
 * inverted luminance mask; the source pixels are unchanged and no path is traced.
 */
export function FigmaIcon({ name, size = 24 }: {
  name: "wallet" | "bell" | "trophy" | "ckb" | "udt";
  size?: number;
}) {
  const id = `figma-icon-${useId().replaceAll(":", "")}`;
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24"
    style={{ width: size, height: size, flexShrink: 0, display: "block" }}>
    <defs><mask id={id} x="0" y="0" width="24" height="24" maskUnits="userSpaceOnUse" style={{maskType: "luminance"}}>
      <image href={`/assets/revamp/${name}.png`} width="24" height="24" style={{filter: "invert(1)"}} />
    </mask></defs>
    <rect width="24" height="24" fill="currentColor" mask={`url(#${id})`} />
  </svg>;
}
