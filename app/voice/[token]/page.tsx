import type { Metadata } from "next";
import ArtistPage from "@/components/voice/ArtistPage";

export const metadata: Metadata = {
  title: "Voice request · Storyverse",
  robots: { index: false, follow: false },
};

export default async function VoiceInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ArtistPage token={token} />;
}
