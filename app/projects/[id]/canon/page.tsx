import { redirect } from "next/navigation";

/** The canon book now lives on the Story page's Book view. */
export default async function CanonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/projects/${id}/story?view=book`);
}
