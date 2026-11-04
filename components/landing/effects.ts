"use client";

import { useState } from "react";
import gsap from "gsap";

/** True once when the device has a fine pointer. Never re-evaluates. */
export function useFinePointer(): boolean {
  const [fine] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: fine)").matches,
  );
  return fine;
}

/**
 * Tilt an element toward the pointer (up to 6 degrees) with a small lift,
 * settling back with power3.out. Attach to the inner card layer only.
 */
export function tiltTo(
  el: HTMLElement,
  px: number,
  py: number,
  setters?: {
    x?: (v: number) => void;
    y?: (v: number) => void;
    rx?: (v: number) => void;
    ry?: (v: number) => void;
  },
): void {
  if (setters) {
    setters.x?.(px * 10);
    setters.y?.(py * 10 - 6);
    setters.rx?.(-py * 12);
    setters.ry?.(px * 12);
    return;
  }
  gsap.to(el, {
    x: px * 10,
    y: py * 10 - 6,
    rotationX: -py * 12,
    rotationY: px * 12,
    duration: 0.4,
    ease: "power3.out",
    overwrite: "auto",
  });
}

export function tiltBack(el: HTMLElement): void {
  gsap.to(el, {
    x: 0,
    y: 0,
    rotationX: 0,
    rotationY: 0,
    duration: 0.6,
    ease: "power3.out",
    overwrite: "auto",
  });
}

/** Relative pointer position in [-0.5, 0.5] for an event on an element. */
export function pointerRatio(
  el: HTMLElement,
  clientX: number,
  clientY: number,
): { px: number; py: number } {
  const box = el.getBoundingClientRect();
  const px = box.width ? (clientX - box.left) / box.width - 0.5 : 0;
  const py = box.height ? (clientY - box.top) / box.height - 0.5 : 0;
  return { px, py };
}
