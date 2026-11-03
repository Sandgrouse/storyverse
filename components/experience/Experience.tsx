"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { World } from "@/lib/world/schemas";
import {
  clearPersistedWorld,
  hydrateWorld,
  loadPersistedWorld,
  persistWorld,
} from "@/lib/story";
import { dropStoredRefs } from "@/lib/images";
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

export type ClientFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  displayUrl?: string;
  sendText?: string;
  sendDataUrl?: string;
  label?: string;
  kind?: string;
};

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
  const [world, setWorld] = useState<World>(() => {
    const persisted = loadPersistedWorld();
    // Stored refs resolve just after first paint; drop them until then so
    // no broken image flashes.
    return persisted ? dropStoredRefs(persisted.world) : seed;
  });
  const [sample, setSample] = useState<boolean>(
    () => loadPersistedWorld()?.sample ?? false,
  );
  const [files, setFiles] = useState<ClientFile[]>([]);
  const [idea, setIdea] = useState("");
  const [scene, setScene] = useState<SceneId>("arrival");

  useEffect(() => {
    setScene(sceneFromHash());
    const onHash = () => setScene(sceneFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    persistWorld(world, sample);
  }, [world, sample]);

  // Stored images load back after the first paint.
  useEffect(() => {
    let live = true;
    void hydrateWorld(world).then((hydrated) => {
      if (live && hydrated !== world) setWorld(hydrated);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = useCallback((id: SceneId) => {
    window.location.hash = id;
  }, []);

  const gallery = useMemo(() => {
    const seen = new Set<string>();
    const paths: string[] = [];
    for (const part of world.parts) {
      if (part.imagePath && !seen.has(part.imagePath)) {
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

  const handleWorld = useCallback((next: World) => {
    setWorld(next);
  }, []);

  const handleSample = useCallback(() => {
    setWorld(seed);
    setSample(true);
  }, [seed]);

  const handleReadDone = useCallback((next: World, nextSample: boolean) => {
    setWorld(next);
    setSample(nextSample);
  }, []);

  const handleStartOver = useCallback(() => {
    clearPersistedWorld(world.id);
    setWorld(seed);
    setSample(false);
    setFiles([]);
    setIdea("");
    window.location.hash = "arrival";
  }, [seed, world.id]);

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
        initialIdea={idea}
        onBack={() => go("arrival")}
        onBegin={(value) => {
          setIdea(value);
          go("bring");
        }}
      />
      <BringScene
        active={scene === "bring"}
        files={files}
        onFiles={setFiles}
        seed={seed}
        sample={sample}
        onSample={handleSample}
        onBack={() => go("arrival")}
        onRead={() => go("reading")}
      />
      <ReadingScene
        active={scene === "reading"}
        files={files}
        idea={idea}
        seed={seed}
        sample={sample}
        onFiles={setFiles}
        onDone={(next, nextSample) => {
          handleReadDone(next, nextSample);
          go("understood");
        }}
      />
      <UnderstoodScene
        active={scene === "understood"}
        world={world}
        onWorld={handleWorld}
        onBack={() => go("bring")}
        onOpen={() => go("channels")}
      />
      <ChannelsScene
        active={scene === "channels"}
        world={world}
        onWorld={handleWorld}
        onOpen={() => go("world")}
      />
      <WorldScene
        active={scene === "world"}
        world={world}
        onWorld={handleWorld}
        onStartOver={handleStartOver}
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
