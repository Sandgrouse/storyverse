"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import ArrivalScene from "@/components/experience/ArrivalScene";

export default function ArrivalHome({ images }: { images: string[] }) {
  const router = useRouter();
  return (
    <main>
      <Link
        className="quiet"
        href="/projects"
        style={{
          position: "absolute",
          right: 34,
          top: 26,
          zIndex: 6,
          textDecoration: "none",
          fontSize: 14,
        }}
      >
        Your projects
      </Link>
      <ArrivalScene
        active
        images={images}
        onBring={() => router.push("/projects/new/material")}
        onIdea={() => router.push("/projects/new/idea")}
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
