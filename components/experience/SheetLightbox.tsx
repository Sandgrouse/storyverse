"use client";

import { useEffect, useState } from "react";
import {
  poseLabelFor,
  sheetLightboxKey,
  wrapSheetIndex,
} from "@/lib/art";

export type SheetLightboxView = {
  view: string;
  imagePath: string;
};

type Props = {
  name: string;
  /** Poses with images, in grid order. */
  views: SheetLightboxView[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  /** Redraw the single pose; stays inside the lightbox. */
  onRedraw: (viewId: string) => void;
  redrawing: boolean;
  tabIndex: 0 | -1;
};

/**
 * Full-screen sheet viewer: the pose large, arrows (and keyboard arrows)
 * to move through the poses with wraparound, the pose name, and Close via
 * the button, the backdrop or Escape. Redrawing is a quiet per-pose link
 * with a confirm line — never a redraw-all.
 */
export default function SheetLightbox({
  name,
  views,
  index,
  onIndex,
  onClose,
  onRedraw,
  redrawing,
  tabIndex,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const count = views.length;
  const at = wrapSheetIndex(index, count);
  const current = views[at];

  // Moving to another pose drops the redraw confirm.
  useEffect(() => {
    setConfirming(false);
  }, [at]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = sheetLightboxKey(e.key);
      if (action === "close") onClose();
      else if (action === "next") onIndex(wrapSheetIndex(at + 1, count));
      else if (action === "prev") onIndex(wrapSheetIndex(at - 1, count));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at, count, onClose, onIndex]);

  if (!current) return null;
  const label = poseLabelFor(current.view);

  return (
    <div
      className="sheetlight"
      role="dialog"
      aria-modal="true"
      aria-label={`${name} character sheet`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheetlight-box">
        <div className="sheetlight-top">
          <b>{label}</b>
          <span className="sheetlight-count">{`${at + 1} of ${count}`}</span>
          <button
            type="button"
            className="quiet"
            onClick={onClose}
            tabIndex={tabIndex}
            aria-label="Close sheet viewer"
          >
            Close
          </button>
        </div>
        <div className="sheetlight-mid">
          <button
            type="button"
            className="sheetlight-arrow"
            onClick={() => onIndex(wrapSheetIndex(at - 1, count))}
            disabled={count < 2}
            tabIndex={tabIndex}
            aria-label="Previous pose"
          >
            ‹
          </button>
          <div
            className="sheetlight-img"
            style={{ backgroundImage: `url(${current.imagePath})` }}
            role="img"
            aria-label={`${name} ${label}`}
          />
          <button
            type="button"
            className="sheetlight-arrow"
            onClick={() => onIndex(wrapSheetIndex(at + 1, count))}
            disabled={count < 2}
            tabIndex={tabIndex}
            aria-label="Next pose"
          >
            ›
          </button>
        </div>
        {confirming ? (
          <p className="sheetconfirm">
            This replaces the current picture.{" "}
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                onRedraw(current.view);
              }}
              disabled={redrawing}
              tabIndex={tabIndex}
            >
              Replace it
            </button>{" "}
            <button
              type="button"
              onClick={() => setConfirming(false)}
              tabIndex={tabIndex}
            >
              Keep it
            </button>
          </p>
        ) : (
          <button
            type="button"
            className="quiet sheetredraw"
            onClick={() => setConfirming(true)}
            disabled={redrawing}
            tabIndex={tabIndex}
          >
            Redraw this pose
          </button>
        )}
      </div>
    </div>
  );
}
