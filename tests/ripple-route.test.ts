import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/ripple/route";
import { RippleResultSchema } from "@/lib/world/schemas";

describe("POST /api/ripple", () => {
  it("returns the seeded ripple fixture", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const ripple = RippleResultSchema.parse(await res.json());
    expect(ripple.change).toBe("Enyinyi told them how to kill him.");
    expect(ripple.fixes).toHaveLength(3);
    expect(ripple.fixes.map((f) => f.id)).toEqual([
      "cure-meaning",
      "stream-clue",
      "women-saw",
    ]);
  });
});
