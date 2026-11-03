import CharactersView from "@/components/CharactersView";
import { createLocalStorage } from "@/lib/storage/local";

export default async function CharactersPage() {
  const world = await createLocalStorage().getWorld();
  return <CharactersView world={world} />;
}
