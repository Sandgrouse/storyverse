import Experience from "@/components/experience/Experience";
import { createLocalStorage } from "@/lib/storage/local";

export default async function HomePage() {
  const world = await createLocalStorage().getWorld();
  return <Experience seed={world} />;
}
