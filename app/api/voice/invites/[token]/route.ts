import { NextResponse } from "next/server";
import { requireOwnerCode } from "@/lib/voice-owner";
import {
  VOICE_INVITE_MISSING_MESSAGE,
  deleteInviteAndFiles,
  publicInvite,
  readInvite,
} from "@/lib/voice-store";

export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Public: the invite without any owner data. Expired or unknown is a calm 404. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const record = await readInvite(token);
  if (!record) {
    return errorResponse(404, "INVITE_NOT_FOUND", VOICE_INVITE_MISSING_MESSAGE);
  }
  return NextResponse.json(publicInvite(record));
}

/** Owner: removes the invite and all its files. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const owner = requireOwnerCode(req);
  if (!owner.ok) {
    return errorResponse(owner.status, owner.code, owner.message);
  }
  const { token } = await params;
  const removed = await deleteInviteAndFiles(token);
  if (!removed) {
    return errorResponse(404, "INVITE_NOT_FOUND", VOICE_INVITE_MISSING_MESSAGE);
  }
  return NextResponse.json({ deleted: true });
}
