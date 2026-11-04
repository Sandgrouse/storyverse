import ArrivalHome from "@/components/projects/ArrivalHome";
import { createLocalStorage } from "@/lib/storage/local";

export default async function HomePage() {
  const world = await createLocalStorage().getWorld();
  const seen = new Set<string>();
  const images: string[] = [];
  for (const part of world.parts) {
    if (part.imagePath && !seen.has(part.imagePath)) {
      seen.add(part.imagePath);
      images.push(part.imagePath);
    }
  }
  for (const character of world.characters) {
    if (character.artPath && !seen.has(character.artPath)) {
      seen.add(character.artPath);
      images.push(character.artPath);
    }
  }
  return <ArrivalHome images={images} />;
}
