// Shared by Server and Client Components (no 'use client' here).

/** Bolds the headword (and simple inflections) inside an example sentence. */
export function highlight(sentence: string, headword: string) {
  const escaped = headword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b(${escaped}(?:s|es|ed|d|ing|er|est)?)\\b`, 'i');
  const parts = sentence.split(re);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-extrabold text-ink">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}
