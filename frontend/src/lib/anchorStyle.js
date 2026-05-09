// Shared positioning helper used by Astral hub, Astral drawer and Tools
// drawer so they all render as floating bubbles anchored to the FAB orb.
// Matches AstralHub's existing anchor logic: side ("right"|"left"|"top"|"bottom")
// + offset (0..1) determines which edge the orb is glued to and how far
// along that edge it sits.

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * Compute a `style` object for a panel anchored next to the FAB orb.
 *
 * @param {object} params
 * @param {{side:string,offset:number}|null|undefined} params.anchor   FAB anchor
 * @param {number}  params.width                                        Panel width
 * @param {number}  params.height                                      Panel height target
 * @param {number} [params.pad=16]                                      Edge padding
 * @param {number} [params.orb=64]                                     Orb size
 */
export function computeAnchorStyle({ anchor, width, height, pad = 16, orb = 64 }) {
  const a = anchor || { side: "right", offset: 0.5 };

  if (typeof window === "undefined") {
    return {
      right: orb + pad,
      top: "50%",
      transform: "translateY(-50%)",
      width,
      maxHeight: `calc(100vh - ${pad * 2}px)`,
    };
  }

  const winW = window.innerWidth;
  const winH = window.innerHeight;

  // Mobile / small screens — center as a modal-style bubble.
  if (winW < 640) {
    return {
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      width: `min(${width}px, calc(100vw - 24px))`,
      maxHeight: "calc(100vh - 32px)",
    };
  }

  if (a.side === "right") {
    const top = clamp(a.offset * winH - height / 2, pad, winH - height - pad);
    return { right: orb + pad, top, width, maxHeight: `calc(100vh - ${pad * 2}px)` };
  }
  if (a.side === "left") {
    const top = clamp(a.offset * winH - height / 2, pad, winH - height - pad);
    return { left: orb + pad, top, width, maxHeight: `calc(100vh - ${pad * 2}px)` };
  }
  if (a.side === "top") {
    const left = clamp(a.offset * winW - width / 2, pad, winW - width - pad);
    return { top: orb + pad, left, width, maxHeight: `calc(100vh - ${pad * 2}px)` };
  }
  // bottom (default fallthrough)
  const left = clamp(a.offset * winW - width / 2, pad, winW - width - pad);
  return { bottom: orb + pad, left, width, maxHeight: `calc(100vh - ${pad * 2}px)` };
}
