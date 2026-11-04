import type { ReactNode } from "react";
import { NewDraftProvider } from "@/components/projects/DraftContext";
import TopBar from "@/components/projects/TopBar";

function SmallScreenNote() {
  return (
    <div className="smallscreen" role="note">
      <div>
        <h1>Best on a larger screen</h1>
        <p>
          This story opens up from 1100 pixels wide. Come back on something
          wider.
        </p>
      </div>
    </div>
  );
}

export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return (
    <NewDraftProvider>
      <TopBar />
      <main>{children}</main>
      <SmallScreenNote />
    </NewDraftProvider>
  );
}
