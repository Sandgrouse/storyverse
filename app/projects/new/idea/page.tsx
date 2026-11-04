"use client";

import { useRouter } from "next/navigation";
import IdeaScene from "@/components/experience/IdeaScene";
import { useNewDraft } from "@/components/projects/DraftContext";

export default function NewIdeaPage() {
  const router = useRouter();
  const { idea, setIdea } = useNewDraft();
  return (
    <main>
      <IdeaScene
        idea={idea}
        onIdea={setIdea}
        onBegin={(value) => {
          setIdea(value);
          router.push("/projects/new/material");
        }}
      />
    </main>
  );
}
