"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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

type Draft = {
  files: ClientFile[];
  setFiles: (files: ClientFile[]) => void;
  idea: string;
  setIdea: (idea: string) => void;
  sample: boolean;
  setSample: (sample: boolean) => void;
  clear: () => void;
};

const DraftContext = createContext<Draft | null>(null);

/**
 * In-progress files and idea text for the `new` pages. Plain client
 * state: it survives moving between pages, and a reload clears it.
 */
export function NewDraftProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<ClientFile[]>([]);
  const [idea, setIdea] = useState("");
  const [sample, setSample] = useState(false);
  const clear = useCallback(() => {
    setFiles([]);
    setIdea("");
    setSample(false);
  }, []);
  const value = useMemo(
    () => ({ files, setFiles, idea, setIdea, sample, setSample, clear }),
    [files, idea, sample, clear],
  );
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useNewDraft(): Draft {
  const draft = useContext(DraftContext);
  if (!draft) throw new Error("useNewDraft must be used under NewDraftProvider");
  return draft;
}
