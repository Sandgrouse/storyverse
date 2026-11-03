import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { RippleResultSchema } from "@/lib/world/schemas";

// Fixture response until the model-backed ripple lands.
export async function POST() {
  const raw = await readFile(
    join(process.cwd(), "data", "seed", "anukili-ripple.json"),
    "utf-8",
  );
  const ripple = RippleResultSchema.parse(JSON.parse(raw));
  return NextResponse.json(ripple);
}
