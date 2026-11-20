import { type CanonId, standing } from "@scripturetips/canon";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { STUDY_SOURCES, type StudyWords } from "../study/types.ts";
import type { PassageResult } from "./api.ts";
import {
  type Block,
  type DesignationOf,
  layOut,
  noteBody,
  type Shown,
  type VerseMark,
  type VerseUnit,
} from "./layout.ts";
import { ShownText } from "./ShownText.tsx";

const HEADINGS: Readonly<Record<string, "h2" | "h3" | "h4" | "p">> = {
  ms: "h2",
  ms1: "h2",
  ms2: "h3",
  ms3: "h3",
  mr: "p",
  s: "h3",
  s1: "h3",
  s2: "h4",
  s3: "h4",
  s4: "h4",
  qa: "h4",
};

/**
 * A compilation's verses that differ from a translation's: † corrected, ‡ adapted (vision §3.1,
 * modification notices), § the user's own rendering, * pasted and not yet declared their own.
 */
export const VERSE_MARKS: Readonly<Record<VerseMark, string>> = {
  correction: "†",
  adaptation: "‡",
  own: "§",
  pasted: "*",
};

/**
 * Study mode in the reading area's read tab: the words to draw, and the translation a verse's
 * wording is from where the verse names none (a translation read whole).
 */
export interface PassageStudy {
  words: StudyWords;
  wordsIn: string;
}

/**
 * A verse's text in study mode, in the wrappers `VerseText` gives it in the compare view (see
 * there), so selecting words and linking them work alike. A verse that runs across paragraphs has
 * one wrapper in each; study mode reads them together (`study/linkAnchor.ts`). Only the KJV
 * family's words are marked (`STUDY_SOURCES`).
 */
function VerseWords({
  unit,
  study,
  nodes,
}: {
  unit: VerseUnit;
  study: PassageStudy;
  nodes: Shown[];
}): ReactNode {
  const wordsIn = unit.own ? "@compilation" : (unit.source ?? study.wordsIn);
  return (
    <span
      className="verse-unit"
      data-canonical={unit.canonical.length > 0 ? unit.canonical.join(" ") : undefined}
      data-words-in={wordsIn}
    >
      <span className="verse-words">
        <ShownText nodes={nodes} study={STUDY_SOURCES.has(wordsIn) ? study.words : null} />
      </span>
    </span>
  );
}

function BlockView({
  block,
  edited,
  study,
}: {
  block: Block;
  /** Words read out after a changed verse's number, for screen readers. */
  edited: Record<VerseMark, string>;
  study?: PassageStudy | undefined;
}): ReactNode {
  if (block.kind === "heading") {
    const Element = HEADINGS[block.marker] ?? "p";
    return (
      <Element className={`h-${block.marker}`}>
        <ShownText nodes={block.content} />
      </Element>
    );
  }
  if (block.marker === "b") return <div className="b-b" aria-hidden="true" />;
  return (
    <p className={`b-${block.marker}`}>
      {block.pieces.map((p) =>
        p.kind === "verse" ? (
          <sup key={p.id} id={p.id} className={p.mark ? "verse edited" : "verse"}>
            {p.label}
            {p.mark ? (
              <>
                <span aria-hidden="true">{VERSE_MARKS[p.mark]}</span>
                <span className="visually-hidden"> {edited[p.mark]}</span>
              </>
            ) : null}
          </sup>
        ) : p.unit && study ? (
          <VerseWords key={p.key} unit={p.unit} study={study} nodes={[p.shown]} />
        ) : (
          <ShownText key={p.key} nodes={[p.shown]} />
        ),
      )}
    </p>
  );
}

/** One passage: its text, then its translator's notes (domain-model §2.6). */
export async function Passage({
  passage,
  index,
  direction,
  canon,
  sources,
  designationOf,
  showLabel = true,
  study,
  below,
}: {
  /** Shown under the text, before the notes: the reader's links to more of the chapter. */
  below?: ReactNode;
  /** False where the page already names the passage (the compilation editor). */
  showLabel?: boolean;
  /** Study mode (the compilation editor's read tab): each verse's words are wrapped and marked. */
  study?: PassageStudy | undefined;
  /** The attribution each verse's text must be followed by (`attributions.ts`). */
  designationOf?: DesignationOf | undefined;
  passage: PassageResult;
  /** In a compilation: the translations its verses came from, to credit adapted notes. */
  sources?: readonly { id: string; abbreviation: string }[] | undefined;
  index: number;
  direction: "ltr" | "rtl";
  /** The reader's canon profile; null when signed out or not chosen yet. */
  canon: CanonId | null;
}) {
  const t = await getTranslations("reader");
  const tc = await getTranslations("canons");
  // A passage's verses all come from its first book (translations.service `versesIn`).
  const place = standing(passage.entered.split(".")[0] ?? "", canon);
  const { blocks, notes } = layOut(passage.verses, `p${index}`, designationOf);
  return (
    <article className="passage" dir={direction}>
      {showLabel ? <h1 className="passage-label">{passage.label}</h1> : null}
      {place === "additional" && canon ? (
        <p className="canon-note">{t("additional", { canon: tc(canon) })}</p>
      ) : place === "varies" ? (
        <p className="canon-note">{t("varies")}</p>
      ) : null}
      {passage.verses.length === 0 ? <p>{t("noVerses")}</p> : null}
      <div className="scripture">
        {blocks.map((b) => (
          <BlockView
            key={b.key}
            block={b}
            study={study}
            edited={{
              correction: t("corrected"),
              adaptation: t("adapted"),
              own: t("ownRendering"),
              pasted: t("pasted"),
            }}
          />
        ))}
      </div>
      {below}
      {notes.length > 0 ? (
        <section className="notes" aria-label={t("notes")}>
          <h2>{t("notes")}</h2>
          <ol>
            {notes.map((n) => (
              <li key={n.id} id={n.id}>
                <a className="note-letter" href={`#${n.id}-mark`}>
                  {n.letter}
                </a>{" "}
                <span className="note-verse">{n.verse}</span>{" "}
                <ShownText nodes={noteBody(n.note.body)} />
                {n.note.origin ? (
                  <small className="note-origin">
                    {" "}
                    {n.note.origin === "own"
                      ? t("noteOwn")
                      : t("noteAdapted", {
                          source: sources?.find((s) => s.id === n.source)?.abbreviation ?? "",
                        })}
                  </small>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </article>
  );
}
