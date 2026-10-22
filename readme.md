
## Website

🌐 Hosted on: https://shadowslavememories.neocities.org/

## Running locally

Serve this directory with any static HTTP server, for example:

```sh
python -m http.server 8765 --bind 127.0.0.1
```

On Windows, `py` can be used instead of `python`. Open `http://127.0.0.1:8765/`.
Deploy [data.js](./data.js) alongside [index.html](./index.html), [script.js](./script.js),
[style.css](./style.css), and [memories.json](./memories.json). No build step is needed.

## Data and settings recovery

[data.js](./data.js) validates JSON once when it loads. Console warnings identify the
memory index/name, history entry, and invalid or missing field.

- Required memory fields: `name`, `rank`, `tier`, and `ChangeHistory`.
  Missing/invalid names become `Unknown memory`; rank/tier become `?`.
  Missing/invalid history becomes an empty array, so ownership is not invented.
- Optional description/type default to empty text; enchantments default to `[]`.
  Enchantments require a name, defaulting to `Unknown enchantment`;
  an unknown `passive` value becomes `null`.
- History entries require a nonnegative integer chapter and an operation type
  (or a `changes` array). Updates/additions also require an allowed field and a value.
  Unsafe operations are skipped with a warning, preserving other valid events.
  An explicitly empty operation type is treated as an informational note.
- Events are sorted by chapter, preserving their order within the same chapter.
  Nested operations inherit their parent chapter and description.
- Invalid JSON syntax or a failed HTTP request displays a reload message. An invalid
  top-level JSON structure falls back to an empty collection with a console warning.
- Saved settings are checked for malformed JSON, incorrect types, and invalid values.
  Valid preferences are retained where possible; invalid values are repaired and saved.
  Unavailable browser storage does not stop browsing, but preferences may not persist.

History snapshots are reconstructed only when the committed chapter or loaded dataset
changes. Search, sorting, and appearance changes reuse the current snapshot. Slider
dragging previews the number; releasing it commits the chapter. Both chapter controls
clamp to the supported range, save the choice, and accept chapter zero.

## Regression checks

With the local server running, open `http://127.0.0.1:8765/tests/`.
The [browser test suite](./tests/regression.js) needs no dependencies and exercises the
actual application in an iframe, including history replay, caching, malformed data,
settings recovery, chapter controls, colors, and load failures.

Use a dedicated local server origin for tests: they temporarily replace that origin's
saved settings, then restore them when the suite finishes. Wait for the pass/fail summary
before closing the test page. The [tests folder](./tests/) is not needed for deployment.
