"use client";

import type { World } from "@/lib/world/schemas";
import PackageDashboard from "@/components/package/PackageDashboard";

type Props = {
  world: World;
  open: boolean;
  onClose: () => void;
};

/**
 * The Agent package drawer: channel tabs, summary tiles, the channel
 * map, grouped readiness rows and the export button live in
 * components/package/PackageDashboard. This file keeps only the drawer
 * chrome (heading and close) so the drawer still opens like the others.
 */
export default function PackDrawer({ world, open, onClose }: Props) {
  return (
    <div className={`drawer${open ? " on" : ""}`} aria-hidden={!open}>
      <button
        className="quiet close"
        onClick={onClose}
        tabIndex={open ? 0 : -1}
      >
        Close
      </button>
      <div className="kicker">Agent package</div>
      <h2>Hand it to any coding agent</h2>
      <PackageDashboard world={world} open={open} />
    </div>
  );
}
