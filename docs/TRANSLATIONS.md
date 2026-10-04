# Translations

The interface text lives in per-language JSON catalogs. English is the source language; the other languages are
registered in `apps/web/src/i18n/locales.ts`, each with a language guide in `docs/translations/`.

The language follows the system (browser or OS) by default and can be changed in **Settings → Language** on the
dashboard or in the editor's Appearance settings. The choice is stored per browser in `localStorage`
(`sketchForge.language`) and applies to the desktop tray menu and update dialogs too.

## Add a language

1. Copy `apps/web/src/i18n/locales/en/` to `apps/web/src/i18n/locales/<code>/` (`<code>` is a two- or three-letter
   ISO 639 code, for example `de`).
2. Write the language guide `docs/translations/glossary.<code>.md`: the glossary (start from the English column of an
   existing guide), the typography and the form of address. Then translate every value in the JSON files following the
   guide and the requirements below. Keep keys and `{placeholders}` unchanged.
3. Register it in `apps/web/src/i18n/locales.ts`:

   ```ts
   import de from "./locales/de";
   // …
   { code: "de", nativeName: "Deutsch", messages: de },
   ```

4. Run `npm test`. `tests/unit/i18n.test.ts` lists missing or extra keys, changed placeholders and missing plural forms.

The desktop app picks up `<code>/desktop.json` automatically; `apps/desktop/electron-builder.yml` already packages every
language's `desktop.json`.

## Translation requirements

**Audience.** SketchForge is a beginner-friendly 3D editor for classrooms, workshops and FabLabs: school students,
teachers and makers who 3D-print, most of them without CAD training. Every text must be clear to a school student on
first reading. Advanced features (STEP/B-Rep, edge fillets and chamfers, sketch extrusion) may use their professional
terms, with the surrounding text saying what they do.

1. **Industry terminology.** Use the terms established in the language's CAD/3D software and standards: the localized
   UIs of Autodesk Fusion / AutoCAD, SolidWorks, Blender, Tinkercad and the national technical standards. When sources
   disagree, prefer the standard, then the most widespread usage. If the established term is unknown to the audience
   (the professional words for camera orbit or pan, "manifold mesh"), use the plain established wording instead
   ("rotate the view", "move the view", "a closed model without holes") — plain, not invented.
2. **No invented words.** No coined terms, literal calques of English, transliterated jargon or words that only make
   sense if you know the English original. If no established term exists, describe the action in plain words.
3. **Clear and unambiguous.** One term per concept and one concept per term across the whole UI. A label must not be
   readable two ways: a word for "cube" for a box with independent width, depth and height is wrong; view zoom and
   object scale must not share a word. Avoid synonyms for the same action in neighbouring controls.
4. **Plain style.** Short sentence-case labels; commands are verbs in the form the language uses for commands, while
   tools, modes and toolbar section labels may be nouns where the language's CAD software does so (see the guide). Messages
   say what happened and what to do next in everyday words, without internal or file-format jargon unless the user must
   act on it. Tutorials: one action per sentence. Address the user politely and consistently, as set in the language
   guide. No slang, no exclamation marks, no humour that doesn't translate.
5. **The language guide is binding.** Use its glossary, typography and form of address; add new recurring terms to it in
   the same pull request. A term you are unsure of goes into the pull request description for review, not into the
   catalog as a guess.

## Catalog format

- One flat key per message, prefixed by its namespace file: `dashboard.settings.saveMethod` lives in `dashboard.json`.
- `{name}` is replaced by a parameter.
- Plurals are objects keyed by [CLDR plural category](https://cldr.unicode.org/index/cldr-spec/plural-rules), chosen by
  the `count` parameter. Each language lists the categories it needs (English `one`/`other`; others may add `zero`,
  `two`, `few`, `many`); the test checks them against `Intl.PluralRules`.

  ```json
  "dashboard.project.shapeCount": { "one": "{count} shape", "other": "{count} shapes" }
  ```

- `<tag>…</tag>` marks text the UI wraps in an element (bold, keyboard key). Keep the tags, translate the text inside.

## In code

| Need | Use |
|---|---|
| Text in a component | `const t = useT();` → `t("ns.key", { count })`; list `t` in hook deps where it is used |
| Text with markup | `t.rich("ns.key", { b: (chunks) => <strong>{chunks}</strong> })` |
| Error shown to the user | throw `new LocalizedError("errors.…", params)`; display with `errorText(t, error, "ns.fallback")` |
| Error from a worker | post `localizedErrorPayload(error)`, rebuild with `errorFromPayload(payload)` |
| Unit symbol | `unitLabel(t, "mm")` |
| Date or number | `Intl.*Format(formattingLocale(t.locale), …)` — keeps the system's regional format |

English (`locales/en`) is the source: keys are type-checked against it, and a key missing in another language falls back
to English at runtime. Default names of created objects and projects (`Box`, `Key Tag`) stay in English because they
are saved into project files.
