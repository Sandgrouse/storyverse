"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SecretUpdate, World } from "@/lib/world/schemas";
import ArrivalScene from "./ArrivalScene";
import IdeaScene from "./IdeaScene";
import BringScene from "./BringScene";
import ReadingScene from "./ReadingScene";
import UnderstoodScene from "./UnderstoodScene";
import ChannelsScene from "./ChannelsScene";
import WorldScene from "./WorldScene";

export type SceneId =
  | "arrival"
  | "idea"
  | "bring"
  | "reading"
  | "understood"
  | "channels"
  | "world";

const ORDER: SceneId[] = [
  "arrival",
  "idea",
  "bring",
  "reading",
  "understood",
  "channels",
  "world",
];

function sceneFromHash(): SceneId {
  if (typeof window === "undefined") return "arrival";
  const id = window.location.hash.replace(/^#\/?/, "");
  return ORDER.includes(id as SceneId) ? (id as SceneId) : "arrival";
}

export default function Experience({ seed }: { seed: World }) {
  const [world, setWorld] = useState<World>(seed);
  const [scene, setScene] = useState<SceneId>("arrival");

  useEffect(() => {
    setScene(sceneFromHash());
    const onHash = () => setScene(sceneFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((id: SceneId) => {
    window.location.hash = id;
  }, []);

  const gallery = useMemo(() => {
    const seen = new Set<string>();
    const paths: string[] = [];
    for (const part of world.parts) {
      if (!seen.has(part.imagePath)) {
        seen.add(part.imagePath);
        paths.push(part.imagePath);
      }
    }
    for (const character of world.characters) {
      if (character.artPath && !seen.has(character.artPath)) {
        seen.add(character.artPath);
        paths.push(character.artPath);
      }
    }
    return paths;
  }, [world]);

  const applySecretUpdates = useCallback((updates: SecretUpdate[]) => {
    setWorld((prev) => ({
      ...prev,
      secrets: prev.secrets.map((secret) => {
        const update = updates.find((u) => u.secretId === secret.id);
        return update
          ? { ...secret, text: update.text, note: update.note }
          : secret;
      }),
    }));
  }, []);

  return (
    <main>
      <ArrivalScene
        active={scene === "arrival"}
        images={gallery}
        onBring={() => go("bring")}
        onIdea={() => go("idea")}
      />
      <IdeaScene
        active={scene === "idea"}
        onBack={() => go("arrival")}
        onBegin={() => go("bring")}
      />
      <BringScene
        active={scene === "bring"}
        world={world}
        onBack={() => go("arrival")}
        onRead={() => go("reading")}
      />
      <ReadingScene
        active={scene === "reading"}
        world={world}
        onDone={() => go("understood")}
      />
      <UnderstoodScene
        active={scene === "understood"}
        world={world}
        onBack={() => go("bring")}
        onOpen={() => go("channels")}
      />
      <ChannelsScene
        active={scene === "channels"}
        world={world}
        onOpen={() => go("world")}
      />
      <WorldScene
        active={scene === "world"}
        world={world}
        onSecrets={applySecretUpdates}
      />
      <div className="smallscreen" role="note">
        <div>
          <h1>Best on a larger screen</h1>
          <p>
            This story opens up from 1100 pixels wide. Come back on something
            wider.
          </p>
        </div>
      </div>
    </main>
  );
}
