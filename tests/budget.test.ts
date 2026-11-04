import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DAILY_LIMIT_MESSAGE,
  ROUTE_COSTS,
  VISITOR_LIMIT_MESSAGE,
  __resetBudgetMemory,
  checkBudget,
  dayKeyUTC,
  hashVisitorIp,
} from "@/lib/budget";
import { POST as ripplePOST } from "@/app/api/ripple/route";
import { WorldSchema, type World } from "@/lib/world/schemas";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

function req(ip: string | null, body: unknown): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (ip !== null) headers["x-forwarded-for"] = ip;
  return new Request("http://localhost/api/ripple", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function loadWorld(): Promise<World> {
  const raw = await readFile(
    join(process.cwd(), "data", "seed", "anukili.json"),
    "utf-8",
  );
  return WorldSchema.parse(JSON.parse(raw));
}

beforeEach(() => {
  __resetBudgetMemory();
  vi.stubEnv("MODEL_API_KEY", "test-key");
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  __resetBudgetMemory();
});

describe("budget caps", () => {
  it("stops the shared daily total with the daily message", async () => {
    vi.stubEnv("DAILY_BUDGET_CENTS", "4");
    vi.stubEnv("VISITOR_BUDGET_CENTS", "1000");
    const first = await checkBudget("read", req("9.9.9.9", {}));
    expect(first).toEqual({ allowed: true });
    const second = await checkBudget("read", req("9.9.9.9", {}));
    expect(second).toEqual({ allowed: false, scope: "daily" });
    expect(DAILY_LIMIT_MESSAGE).toBe(
      "Today's demo limit is used up. You can still explore the sample story.",
    );
  });

  it("limits each visitor separately with the visitor message", async () => {
    vi.stubEnv("DAILY_BUDGET_CENTS", "1000");
    vi.stubEnv("VISITOR_BUDGET_CENTS", "5");
    const first = await checkBudget("read", req("1.1.1.1", {}));
    expect(first).toEqual({ allowed: true });
    const second = await checkBudget("read", req("1.1.1.1", {}));
    expect(second).toEqual({ allowed: false, scope: "visitor" });
    const other = await checkBudget("read", req("2.2.2.2", {}));
    expect(other).toEqual({ allowed: true });
    expect(VISITOR_LIMIT_MESSAGE).toBe(
      "You've reached the demo limit for today. You can still explore the sample story.",
    );
  });

  it("charges the listed cost per route", () => {
    expect(ROUTE_COSTS).toEqual({
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
      cutout: 1,
      "voice-suggest": 1,
      "voice-speak": 2,
      "voice-design": 3,
    });
  });

  it("resets at midnight UTC", () => {
    expect(dayKeyUTC(new Date("2026-11-03T23:59:59.000Z"))).toBe("2026-11-03");
    expect(dayKeyUTC(new Date("2026-11-04T00:00:00.000Z"))).toBe("2026-11-04");
  });

  it("starts over after a memory reset", async () => {
    vi.stubEnv("DAILY_BUDGET_CENTS", "3");
    vi.stubEnv("VISITOR_BUDGET_CENTS", "1000");
    expect(await checkBudget("read", req("3.3.3.3", {}))).toEqual({
      allowed: true,
    });
    expect(await checkBudget("read", req("3.3.3.3", {}))).toEqual({
      allowed: false,
      scope: "daily",
    });
    __resetBudgetMemory();
    expect(await checkBudget("read", req("3.3.3.3", {}))).toEqual({
      allowed: true,
    });
  });

  it("hashes the caller and never stores the raw address", () => {
    const hashed = hashVisitorIp("1.2.3.4");
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed).not.toContain("1.2.3.4");
    expect(hashVisitorIp("1.2.3.4")).toBe(hashed);
    expect(hashVisitorIp("5.6.7.8")).not.toBe(hashed);
    expect(hashVisitorIp("1.2.3.4, 9.9.9.9")).toBe(hashed);
  });

  it("lets the request through when storage fails", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "fake-token");
    vi.stubEnv("DAILY_BUDGET_CENTS", "1000");
    vi.stubEnv("VISITOR_BUDGET_CENTS", "1000");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("blob down");
      }),
    );
    const result = await checkBudget("read", req("4.4.4.4", {}));
    expect(result).toEqual({ allowed: true });
  });
});

describe("POST /api/ripple budget", () => {
  it("returns 429 with the visitor message over the visitor limit", async () => {
    vi.stubEnv("DAILY_BUDGET_CENTS", "1000");
    vi.stubEnv("VISITOR_BUDGET_CENTS", "1");
    const world = await loadWorld();
    const fetchMock = vi.fn(async () => {
      throw new Error("model must not be called");
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await ripplePOST(
      req("7.7.7.7", { change: "What if the pots break?", world }),
    );
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: { code: "BUDGET", message: VISITOR_LIMIT_MESSAGE },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 429 with the daily message over the daily limit", async () => {
    vi.stubEnv("DAILY_BUDGET_CENTS", "1");
    vi.stubEnv("VISITOR_BUDGET_CENTS", "1000");
    const world = await loadWorld();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("model must not be called");
      }),
    );
    const res = await ripplePOST(
      req("8.8.8.8", { change: "What if the pots break?", world }),
    );
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: { code: "BUDGET", message: DAILY_LIMIT_MESSAGE },
    });
  });
});
