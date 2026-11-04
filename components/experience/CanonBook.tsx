"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { World } from "@/lib/world/schemas";
import {
  bookPassageForPart,
  chapterCountFor,
  coverChips,
  highlightPassage,
} from "@/lib/canon";

/**
 * The book: contents, a scrollable page with highlighted names, and the
 * characters and places panel. Used by the reading page once Muse finishes
 * and by the canon page with no reading animation.
 */
export default function CanonBook({ world }: { world: World }) {
  const parts = useMemo(
    () => [...world.parts].sort((a, b) => a.order - b.order),
    [world.parts],
  );
  const [tab, setTab] = useState<"c" | "p">("c");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chips = useMemo(() => coverChips(world), [world]);

  const focused =
    world.characters.find((c) => c.id === focusedId) != null
      ? { kind: "c" as const, id: focusedId as string }
      : world.locations.find((l) => l.id === focusedId) != null
        ? { kind: "p" as const, id: focusedId as string }
        : null;

  const focus = (id: string, kind: "c" | "p") => {
    setTab(kind);
    setFocusedId(id);
  };

  const jumpTo = (index: number) => {
    const root = scrollRef.current;
    if (!root) return;
    const part = parts[index];
    if (!part) return;
    root.querySelector(`[data-chapter="${part.id}"]`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const onScroll = () => {
    const root = scrollRef.current;
    if (!root) return;
    const max = root.scrollHeight - root.clientHeight;
    setProgress(max > 0 ? root.scrollTop / max : 0);
    let current = 0;
    parts.forEach((part, i) => {
      const node = root.querySelector(`[data-chapter="${part.id}"]`);
      if (
        node instanceof HTMLElement &&
        node.offsetTop - root.scrollTop < root.clientHeight * 0.4
      ) {
        current = i;
      }
    });
    setActive(current);
  };

  const list =
    tab === "c" ? world.characters : world.locations;

  return (
    <div className="canonbook">
      <aside className="canon-toc" aria-label="Contents">
        <h4>Contents</h4>
        <select
          className="canon-tocselect"
          aria-label="Contents"
          value={String(active)}
          onChange={(e) => jumpTo(Number(e.target.value))}
        >
          {parts.map((part, i) => (
            <option key={part.id} value={i}>
              {i + 1} · {part.title}
            </option>
          ))}
        </select>
        <div className="canon-toclist">
          {parts.map((part, i) => (
            <button
              key={part.id}
              type="button"
              className={i === active ? "on" : ""}
              onClick={() => jumpTo(i)}
            >
              <i>{i + 1}</i>
              {part.title}
            </button>
          ))}
        </div>
        <div className="canon-prog" aria-hidden="true">
          <b style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </aside>

      <article className="canon-book">
        <div className="canon-pagescroll" ref={scrollRef} onScroll={onScroll}>
          <div className="canon-cover">
            <div className="canon-kicker">The story</div>
            <h1>{world.title}</h1>
            <p className="canon-log">{world.logline}</p>
            <div className="canon-chips">
              {chips.map((chip) => (
                <span key={chip}>{chip}</span>
              ))}
            </div>
          </div>
          <div>
            {parts.map((part, i) => (
              <section
                key={part.id}
                className="canon-chap"
                data-chapter={part.id}
              >
                <small>Chapter {i + 1}</small>
                <h2>{part.title}</h2>
                <p className="canon-sum">{part.summary}</p>
                <p className="canon-body">
                  {highlightPassage(bookPassageForPart(part), world).map(
                    (seg, j) =>
                      seg.kind && seg.id ? (
                        <mark
                          key={j}
                          className={
                            seg.kind === "place"
                              ? "canon-place"
                              : "canon-char"
                          }
                          data-id={seg.id}
                          onClick={() =>
                            focus(
                              seg.id as string,
                              seg.kind === "place" ? "p" : "c",
                            )
                          }
                        >
                          {seg.text}
                        </mark>
                      ) : (
                        <span key={j}>{seg.text}</span>
                      ),
                  )}
                </p>
              </section>
            ))}
          </div>
        </div>
      </article>

      <aside className="canon-side" aria-label="Characters and places">
        <div className="canon-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "c"}
            className={tab === "c" ? "on" : ""}
            onClick={() => setTab("c")}
          >
            Characters
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "p"}
            className={tab === "p" ? "on" : ""}
            onClick={() => setTab("p")}
          >
            Places
          </button>
        </div>
        <div className="canon-cards">
          {list.map((entry) => {
            const kind = tab === "c" ? "character" : "place";
            const open = focused?.id === entry.id;
            const canonText =
              "canon" in entry ? entry.canon : entry.description;
            const art = "artPath" in entry ? entry.artPath : "";
            const appears = chapterCountFor(
              entry.id,
              tab === "c" ? "character" : "place",
              world,
            );
            return (
              <div
                key={entry.id}
                className={`canon-cc${open ? " open" : ""}`}
                onClick={() =>
                  focus(entry.id, tab === "c" ? "c" : "p")
                }
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    focus(entry.id, tab === "c" ? "c" : "p");
                  }
                }}
              >
                <div className="canon-row">
                  <div
                    className="canon-th"
                    style={
                      art
                        ? { backgroundImage: `url(${art})` }
                        : {
                            backgroundImage: "none",
                            backgroundColor: "#e9e0ce",
                          }
                    }
                  />
                  <div>
                    <b>{entry.name}</b>
                    <small>{kind === "character" ? "Character" : "Place"}</small>
                  </div>
                </div>
                {open && (
                  <div className="canon-more">
                    <div
                      className="canon-big"
                      style={
                        art
                          ? { backgroundImage: `url(${art})` }
                          : {
                              backgroundImage: "none",
                              backgroundColor: "#e9e0ce",
                            }
                      }
                    />
                    <div className="canon-nm">{entry.name}</div>
                    <div className="canon-t">
                      {canonText}
                      <br />
                      <span className="canon-appears">
                        Appears in {appears} of {parts.length}{" "}
                        {parts.length === 1 ? "chapter" : "chapters"}
                      </span>
                      {kind === "character" && (
                        <span className="canon-openwrap">
                          <Link
                            className="canon-openlink"
                            href={`/projects/${world.id}/characters?c=${entry.id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            Open in Characters
                          </Link>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
