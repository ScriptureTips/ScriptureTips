"use client";

import { useTranslations } from "next-intl";
import type { Wording } from "./items.ts";
import { wordingKey } from "./requests.ts";

/**
 * A choice of wording: the translations, then the user's compilations' own wording. `value` and
 * `onChange` are keys (`wordingKey`); with `placeholder`, nothing is chosen until the user picks.
 */
export function WordingSelect({
  label,
  wordings,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  wordings: readonly Wording[];
  value: string;
  onChange: (key: string) => void;
  placeholder?: string;
}) {
  const t = useTranslations("annotations");
  const group = (own: boolean) =>
    wordings
      .filter((w) => (w.in === "@compilation") === own)
      .map((w) => (
        <option key={wordingKey(w)} value={wordingKey(w)}>
          {w.label}
        </option>
      ));
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        <optgroup label={t("translations")}>{group(false)}</optgroup>
        <optgroup label={t("yourCompilations")}>{group(true)}</optgroup>
      </select>
    </label>
  );
}
