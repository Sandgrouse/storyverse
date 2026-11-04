// Server only. Never import this module from a client component: it
// compares the project owner's voice code. Route handlers (server) are
// the only callers.

import { timingSafeEqual } from "node:crypto";
import { hashVisitorIp } from "@/lib/budget";

if (typeof window !== "undefined") {
  throw new Error("lib/voice-owner.ts is server only");
}

/** Header carrying the project owner's voice code. */
export const OWNER_CODE_HEADER = "x-voice-owner-code";

/** After this many wrong codes from one hashed IP in an hour, 429. */
export const OWNER_CODE_MAX_ATTEMPTS = 10;
export const OWNER_CODE_WINDOW_MS = 60 * 60 * 1000;

export const OWNER_CODE_REQUIRED_MESSAGE =
  "Custom voices are for this project's owner.";
export const OWNER_CODE_INVALID_MESSAGE = "That code isn't right.";
export const OWNER_CODE_LOCKED_MESSAGE =
  "Too many wrong codes. Try again in an hour.";
export const OWNER_CODE_MISSING_MESSAGE = "Custom voices aren't set up here yet.";

const attempts = new Map<string, number[]>();

/** Test-only reset of the wrong-code attempt log. */
export function __resetOwnerAttempts(): void {
  attempts.clear();
}

function prune(now: number): void {
  for (const [key, times] of attempts) {
    const fresh = times.filter((t) => now - t < OWNER_CODE_WINDOW_MS);
    if (fresh.length === 0) attempts.delete(key);
    else attempts.set(key, fresh);
  }
}

function wrongCount(hashedIp: string, now: number): number {
  return (attempts.get(hashedIp) ?? []).filter((t) => now - t < OWNER_CODE_WINDOW_MS)
    .length;
}

/** Record a wrong code for this hashed IP. */
export function recordOwnerFailure(hashedIp: string, now: number = Date.now()): void {
  const list = attempts.get(hashedIp) ?? [];
  list.push(now);
  attempts.set(hashedIp, list);
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // Compare against a same-length buffer so timing reveals nothing
    // about the expected length, then fail.
    const padded = Buffer.alloc(ab.length, 0);
    try {
      timingSafeEqual(ab, padded);
    } catch {
      // Lengths always match here; ignore.
    }
    return false;
  }
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

export type OwnerCheck =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

/**
 * Require the owner's voice code. Missing header and wrong codes are
 * 401s; more than OWNER_CODE_MAX_ATTEMPTS wrong codes from one hashed
 * IP in an hour is a 429. When VOICE_OWNER_CODE is unset, every check
 * is a 503 so nothing can be created.
 */
export function requireOwnerCode(req: Request, now: number = Date.now()): OwnerCheck {
  const expected = process.env.VOICE_OWNER_CODE ?? "";
  if (expected.length === 0) {
    return { ok: false, status: 503, code: "NO_OWNER_CODE", message: OWNER_CODE_MISSING_MESSAGE };
  }
  const hashedIp = hashVisitorIp(req.headers.get("x-forwarded-for"));
  prune(now);
  if (wrongCount(hashedIp, now) >= OWNER_CODE_MAX_ATTEMPTS) {
    return { ok: false, status: 429, code: "OWNER_CODE_LOCKED", message: OWNER_CODE_LOCKED_MESSAGE };
  }
  const given = req.headers.get(OWNER_CODE_HEADER) ?? "";
  if (given.length === 0) {
    return { ok: false, status: 401, code: "OWNER_CODE_REQUIRED", message: OWNER_CODE_REQUIRED_MESSAGE };
  }
  if (!constantTimeEqual(given, expected)) {
    recordOwnerFailure(hashedIp, now);
    if (wrongCount(hashedIp, now) >= OWNER_CODE_MAX_ATTEMPTS) {
      return { ok: false, status: 429, code: "OWNER_CODE_LOCKED", message: OWNER_CODE_LOCKED_MESSAGE };
    }
    return { ok: false, status: 401, code: "OWNER_CODE_INVALID", message: OWNER_CODE_INVALID_MESSAGE };
  }
  return { ok: true };
}
