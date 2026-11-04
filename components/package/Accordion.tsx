"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * One collapsible section: a header with a name, a made/total count
 * and a small bar. A real button, so it opens and closes by keyboard.
 */
export default function Accordion({
  name,
  made,
  total,
  defaultOpen = false,
  children,
}: {
  name: string;
  made: number;
  total: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const pct =
    total <= 0 ? 100 : Math.round((Math.max(0, Math.min(1, made / total))) * 100);
  return (
    <div className="packacc">
      <button
        type="button"
        className="packacc-head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="packacc-name">{name}</span>
        <span className="packacc-count" aria-label={`${made} of ${total} made`}>
          {made} of {total}
        </span>
        <span
          className="packbar packacc-bar"
          role="progressbar"
          aria-label={name}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${pct}%` }} />
        </span>
      </button>
      <div id={bodyId} role="region" aria-label={name} hidden={!open}>
        <div className="packacc-body">{children}</div>
      </div>
    </div>
  );
}
