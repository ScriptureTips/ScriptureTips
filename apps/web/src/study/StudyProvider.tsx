"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { StudyWords } from "./types.ts";

const StudyContext = createContext<StudyWords | null>(null);

/** Study mode's words for what's below it; without a provider, text is drawn plain. */
export function StudyProvider({
  words,
  names = {},
  children,
}: {
  words: StudyWords;
  /** Translation IDs to their abbreviations (to name whose a note is). */
  names?: Readonly<Record<string, string>>;
  children: ReactNode;
}) {
  return (
    <StudyContext.Provider value={words}>
      <NamesContext.Provider value={names}>{children}</NamesContext.Provider>
    </StudyContext.Provider>
  );
}

const NamesContext = createContext<Readonly<Record<string, string>>>({});

/** The abbreviations of the translations in study mode's text. */
export const useSourceNames = (): Readonly<Record<string, string>> => useContext(NamesContext);

/** The words study mode draws, or null when it's off. */
export const useStudy = (): StudyWords | null => useContext(StudyContext);
