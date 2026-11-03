import StoryMap from "@/components/StoryMap";
import { createLocalStorage } from "@/lib/storage/local";

export default async function StoryMapPage() {
  const world = await createLocalStorage().getWorld();
  return <StoryMap world={world} />;
}
