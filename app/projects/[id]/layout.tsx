"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { ProjectProvider } from "@/components/projects/ProjectContext";

export default function ProjectLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  return <ProjectProvider id={params.id}>{children}</ProjectProvider>;
}
