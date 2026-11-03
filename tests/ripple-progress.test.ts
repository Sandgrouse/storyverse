import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHECK_INSTRUCTIONS,
  RIPPLE_INSTRUCTIONS,
  buildRippleSecretUpdateSchema,
  createRippleProgress,
  serializeCanon,
  settleRippleWorld,
  toSecretUpdates,
} from "@/lib/ripple";
import { WorldSchema, type World } from "@/lib/world/schemas";

async function loadWorld(): Promise<World> {
  const raw = await readFile(
    join(process.cwd(), "data", "seed", "anukili.json"),
    "utf-8",
  );
  return WorldSchema.parse(JSON.parse(raw));
}

describe("ripple decisions", () => {
  it("records two quick Keep-as-is taps instead of losing one", () => {
    const progress = createRippleProgress(2);
    // No render happens between the two taps, so both card handlers run
    // against the same state. Both decisions must still land.
    const afterFirst = progress.decide("fix-a", "kept");
    const afterSecond = progress.decide("fix-b", "kept");
    expect(afterFirst).toEqual({ "fix-a": "kept" });
    expect(afterSecond).toEqual({ "fix-a": "kept", "fix-b": "kept" });
    expect(progress.isSettled()).toBe(true);
    expect(progress.remaining()).toBe(0);
  });

  it("keeps decisions made while another card is still applying", () => {
    const progress = createRippleProgress(3);
    progress.decide("fix-a", "applied");
    progress.decide("fix-b", "kept");
    expect(progress.isSettled()).toBe(false);
    expect(progress.remaining()).toBe(1);
    const done = progress.decide("fix-c", "kept");
    expect(done).toEqual({
      "fix-a": "applied",
      "fix-b": "kept",
      "fix-c": "kept",
    });
    expect(progress.isSettled()).toBe(true);
  });

  it("never counts the same card twice", () => {
    const progress = createRippleProgress(2);
    progress.decide("fix-a", "kept");
    progress.decide("fix-a", "applied");
    expect(progress.snapshot()).toEqual({ "fix-a": "kept" });
    expect(progress.isSettled()).toBe(false);
    expect(progress.remaining()).toBe(1);
  });
});

describe("settling the canon", () => {
  it("records the change and updates secrets without moving knownThrough", async () => {
    const world = await loadWorld();
    const settled = settleRippleWorld(world, "Enyinyi told them how to kill him.", [
      {
        secretId: "fire-plan",
        text: "Enyinyi came up with the plan that finally worked",
        note: "Still unrevealed.",
      },
    ]);
    expect(settled.canonChanges).toEqual([
      "Enyinyi told them how to kill him.",
    ]);
    const fire = settled.secrets.find((s) => s.id === "fire-plan");
    expect(fire?.text).toBe(
      "Enyinyi came up with the plan that finally worked",
    );
    expect(fire?.note).toBe("Still unrevealed.");
    expect(fire?.knownThrough).toEqual([]);
    const untouched = settled.secrets.find((s) => s.id === "why-lived");
    expect(untouched?.text).toBe("Why the baby lived past the fourth day");
  });

  it("never records the same change twice", async () => {
    const world = await loadWorld();
    const once = settleRippleWorld(world, "A mango falls at noon.", []);
    const twice = settleRippleWorld(once, "A mango falls at noon.", []);
    expect(twice.canonChanges).toEqual(["A mango falls at noon."]);
  });

  it("serializes established changes at the top of the canon text", async () => {
    const world = await loadWorld();
    const plain = serializeCanon(world);
    expect(plain).toContain("Established changes to the canon:");
    const settled = settleRippleWorld(
      world,
      "Enyinyi told them how to kill him.",
      [],
    );
    const text = serializeCanon(settled);
    expect(text).toContain("Established changes to the canon:");
    expect(text).toContain("Enyinyi told them how to kill him.");
    expect(
      text.indexOf("Established changes to the canon:"),
    ).toBeLessThan(text.indexOf("Characters:"));
  });
});

describe("secret updates from the model", () => {
  it("constrains secretId to an enum of the world's secret ids", async () => {
    const world = await loadWorld();
    const schema = buildRippleSecretUpdateSchema(world);
    expect(schema.shape.secretId.options).toEqual(
      world.secrets.map((s) => s.id),
    );
    expect(
      schema.safeParse({
        secretId: "fire-plan",
        text: "Enyinyi came up with the plan that finally worked",
        note: "Still unrevealed.",
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        secretId: "secret-made-up",
        text: "x",
        note: "y",
      }).success,
    ).toBe(false);
  });

  it("drops updates whose secretId does not resolve", async () => {
    const world = await loadWorld();
    const updates = toSecretUpdates(
      [
        {
          secretId: "fire-plan",
          text: "Enyinyi came up with the plan that finally worked",
          note: "Still unrevealed.",
        },
        { secretId: "secret-made-up", text: "x", note: "y" },
      ],
      world,
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].secretId).toBe("fire-plan");
  });

  it("asks the model to keep which channels may know an updated secret", () => {
    expect(RIPPLE_INSTRUCTIONS).toContain("keeping which channels may know it");
  });

  it("asks the check about contradictions, leaks, and silent channels", () => {
    expect(CHECK_INSTRUCTIONS).toContain("leaks a secret");
    expect(CHECK_INSTRUCTIONS).toContain("staying silent");
    expect(CHECK_INSTRUCTIONS).toContain("kept as is");
  });
});
