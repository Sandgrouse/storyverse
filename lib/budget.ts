import { createHash } from "node:crypto";

/**
 * Shared demo budget: a daily cents cap across all visitors plus a
 * smaller per-visitor daily cap. Every route that calls a model charges
 * here before calling out. Sample paths (no MODEL_API_KEY) never reach
 * this module, so browsing the sample story is always free.
 *
 * Storage is a small JSON file in Vercel Blob, read before each charge
 * and written after it. Serverless instances may race; that is
 * acceptable for this purpose. An in-memory count is kept too and the
 * higher total wins. With no BLOB_READ_WRITE_TOKEN only memory is used.
 * A storage failure never blocks a request by itself.
 */

export const ROUTE_COSTS = {
  read: 3,
  plan: 3,
  ripple: 2,
  apply: 1,
  check: 1,
  pack: 1,
  "sheet-view": 1,
  scene: 2,
  "script-draft": 1,
  "script-check": 1,
  "video-plan": 1,
  cutout: 1,
  "voice-suggest": 1,
  "voice-speak": 2,
} as const;

export type BudgetRoute = keyof typeof ROUTE_COSTS;

export type BudgetScope = "daily" | "visitor";

export const DAILY_LIMIT_MESSAGE =
  "Today's demo limit is used up. You can still explore the sample story.";

export const VISITOR_LIMIT_MESSAGE =
  "You've reached the demo limit for today. You can still explore the sample story.";

/** Vercel's request limit. Model routes reject bodies over this. */
export const MAX_BODY_BYTES = 4_500_000;

export function dailyBudgetCents(): number {
  const raw = Number(process.env.DAILY_BUDGET_CENTS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 300;
}

export function visitorBudgetCents(): number {
  const raw = Number(process.env.VISITOR_BUDGET_CENTS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 60;
}

/** UTC calendar day, so the total resets at midnight UTC. */
export function dayKeyUTC(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Hash the caller for the per-visitor cap. Only the first
 * x-forwarded-for entry is used, and only its hash is ever stored.
 * The raw address is never kept.
 */
export function hashVisitorIp(header: string | null): string {
  const first = (header ?? "").split(",")[0]?.trim() ?? "";
  const caller = first.length > 0 ? first : "direct";
  return createHash("sha256").update(caller).digest("hex");
}

type BlobState = {
  day: string;
  total: number;
  visitors: Record<string, number>;
};

function blobPath(day: string): string {
  return `storyverse-budget/${day}.json`;
}

// In-memory count, keyed by day. The higher of memory and Blob wins.
let memDay = "";
let memTotal = 0;
const memVisitors = new Map<string, number>();

/** Test-only reset of the in-memory count. */
export function __resetBudgetMemory(): void {
  memDay = "";
  memTotal = 0;
  memVisitors.clear();
}

function memForDay(day: string): { total: number; visitors: Map<string, number> } {
  if (memDay !== day) {
    memDay = day;
    memTotal = 0;
    memVisitors.clear();
  }
  return { total: memTotal, visitors: memVisitors };
}

async function readBlob(day: string): Promise<BlobState | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  try {
    const { list } = await import("@vercel/blob");
    const found = await list({ prefix: blobPath(day), token });
    const match = found.blobs.find((b) => b.pathname === blobPath(day)) ?? found.blobs[0];
    if (!match) return null;
    const res = await fetch(match.url, { cache: "no-store" });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (json === null || typeof json !== "object") return null;
    const record = json as Record<string, unknown>;
    if (record.day !== day) return null;
    const total = typeof record.total === "number" && record.total >= 0 ? record.total : 0;
    const visitors =
      record.visitors !== null && typeof record.visitors === "object"
        ? (record.visitors as Record<string, number>)
        : {};
    return { day, total, visitors };
  } catch {
    return null;
  }
}

async function writeBlob(state: BlobState): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return;
  try {
    const { put } = await import("@vercel/blob");
    await put(blobPath(state.day), JSON.stringify(state), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      token,
    });
  } catch {
    // A storage failure must never block a request by itself.
  }
}

export function budgetMessage(scope: BudgetScope): string {
  return scope === "daily" ? DAILY_LIMIT_MESSAGE : VISITOR_LIMIT_MESSAGE;
}

export type ChargeResult =
  | { allowed: true }
  | { allowed: false; scope: BudgetScope };

/**
 * Charge one model call against both caps. Reads Blob storage before
 * the charge and writes after it; failures fall back to memory alone.
 */
export async function checkBudget(
  route: BudgetRoute,
  req: Request,
): Promise<ChargeResult> {
  const cost = ROUTE_COSTS[route];
  const day = dayKeyUTC();
  const visitor = hashVisitorIp(req.headers.get("x-forwarded-for"));

  const mem = memForDay(day);
  const stored = await readBlob(day);

  const total = Math.max(mem.total, stored?.total ?? 0);
  const visitorTotal = Math.max(
    mem.visitors.get(visitor) ?? 0,
    stored?.visitors[visitor] ?? 0,
  );

  if (total + cost > dailyBudgetCents()) {
    return { allowed: false, scope: "daily" };
  }
  if (visitorTotal + cost > visitorBudgetCents()) {
    return { allowed: false, scope: "visitor" };
  }

  const next: BlobState = {
    day,
    total: total + cost,
    visitors: { ...(stored?.visitors ?? {}), [visitor]: visitorTotal + cost },
  };
  memTotal = next.total;
  mem.visitors.set(visitor, visitorTotal + cost);
  await writeBlob(next);
  return { allowed: true };
}
