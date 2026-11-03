import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { RippleResultSchema } from "@/lib/world/schemas";

// FIXTURE (task 001): stand-in response until the model-backed ripple lands.
// Kept in data/seed/saltlight-ripple.json so it is easy to find and remove.
export async function POST() {
  const raw = await readFile(
    join(process.cwd(), "data", "seed", "saltlight-ripple.json"),
    "utf-8",
  );
  const ripple = RippleResultSchema.parse(JSON.parse(raw));
  return NextResponse.json(ripple);
}
