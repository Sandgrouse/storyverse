"use client";

import { useRouter } from "next/navigation";
import { WorldSchema, type World } from "@/lib/world/schemas";
import BringScene from "@/components/experience/BringScene";
import { useNewDraft } from "@/components/projects/DraftContext";
import seedJson from "@/data/seed/anukili.json";

export default function NewMaterialPage() {
  const router = useRouter();
  const { files, setFiles, idea, sample, setSample } = useNewDraft();
  const seed = WorldSchema.parse(seedJson) as World;
  return (
    <main>
      <BringScene
        files={files}
        onFiles={setFiles}
        seed={seed}
        sample={sample}
        onSample={() => setSample(true)}
        onRead={() => router.push("/projects/new/reading")}
      />
      {idea.trim() ? (
        <p className="gapnote" style={{ bottom: 130 }}>
          Your idea comes along to the reading.
        </p>
      ) : null}
    </main>
  );
}
