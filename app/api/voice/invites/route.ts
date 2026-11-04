import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_BODY_BYTES } from "@/lib/budget";
import { requireOwnerCode } from "@/lib/voice-owner";
import { makeInviteToken, saveInvite, type InviteCharacter } from "@/lib/voice-store";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const InviteCharacterSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  brief: z.string().max(2000).default(""),
  lines: z.array(z.string().min(1).max(500)).min(1).max(12),
});

const InviteRequestSchema = z.object({
  projectTitle: z.string().min(1).max(120),
  note: z.string().max(2000).default(""),
  characters: z.array(InviteCharacterSchema).min(1).max(12),
});

/**
 * Create a voice-artist invite. Owner only. The invite stores only the
 * given fields — project title, note and each character's id, name,
 * brief and lines — never canon or secrets.
 */
export async function POST(req: Request) {
  const owner = requireOwnerCode(req);
  if (!owner.ok) {
    return errorResponse(owner.status, owner.code, owner.message);
  }

  const raw = await req.text().catch(() => null);
  if (raw === null) {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { projectTitle, note, characters }.");
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return errorResponse(413, "REQUEST_TOO_LARGE", "That request is too large.");
  }
  let body: unknown = null;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { projectTitle, note, characters }.");
  }
  const parsed = InviteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Expected { projectTitle, note, characters }.");
  }

  const token = makeInviteToken();
  const characters: InviteCharacter[] = parsed.data.characters.map((c) => ({
    id: c.id,
    name: c.name,
    brief: c.brief,
    lines: c.lines,
  }));
  await saveInvite({
    token,
    projectTitle: parsed.data.projectTitle,
    note: parsed.data.note,
    characters,
    createdAt: Date.now(),
    submissions: [],
  });

  let url = `/voice/${token}`;
  try {
    const base = new URL(req.url);
    url = `${base.origin}/voice/${token}`;
  } catch {
    // Relative path fallback; ignore.
  }
  return NextResponse.json({ token, url }, { status: 201 });
}
