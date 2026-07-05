# History Trends Unlimited Compatibility

## Requirement

Import/export compatibility with History Trends Unlimited must be 100% compatible.

That means:

- existing HTU export files import correctly
- this extension can export files HTU accepts
- imported and re-exported data preserves all compatible fields
- line endings, encoding, timestamp representation, field order, and escaping are tested

## Known From Old Code

The removed implementation contained a parser/exporter that expected four tab-separated fields:

```text
url<TAB>UlastVisitTime<TAB>typedCount<TAB>title
```

Notes:

- `lastVisitTime` could optionally start with `U`.
- rows were separated by CRLF.
- title was the fourth field.

This is useful evidence, but it is not a complete specification.

## Source Research Result

History Trends Unlimited 1.8.9 source has been inspected from the Chrome Web Store CRX package.

See `docs/htu-source-analysis.md` for the extracted behavior.

Compatibility work should still be fixture-driven:

- source analysis defines expected behavior
- real exported files lock byte-level details
- tests must cover both source-derived cases and real fixtures

## Required Fixtures

Add real exported files under `fixtures/htu/` before declaring compatibility complete:

- small export with ASCII titles and URLs
- export with Chinese titles and URLs
- export with tabs, quotes, commas, and newlines in titles if HTU can produce them
- export with empty title
- export with repeated URLs
- export with old and new timestamp values
- export from every HTU version we need to support

At minimum, fixtures must cover:

- 3-column archived import
- 4-column archived import/export
- 8-column analysis import/export
- archived timestamps with `U`
- archived timestamps without `U` using Windows epoch
- integer transition IDs
- text transition types

Fixture files should not be normalized by editors.

## Test Contract

Parser tests:

- detect encoding
- preserve all fields
- reject malformed rows with actionable errors
- collect warnings without losing valid rows

Serializer tests:

- produce exactly expected bytes for known rows
- preserve HTU timestamp prefix behavior
- preserve CRLF/LF behavior according to compatibility mode
- guarantee files can be imported by HTU

Round-trip tests:

- HTU export -> parser -> serializer -> byte comparison when exact mode is possible
- HTU export -> parser -> internal model -> serializer -> HTU import smoke test when available

## Confirmed From Source

- HTU exports TSV.
- HTU has archived and analysis TSV formats.
- HTU exports one row per visit.
- Archived export has 4 columns: URL, `U` + Unix millisecond visit time, integer transition ID, title.
- Analysis export has 8 columns: URL, host, root domain, Unix millisecond visit time, local datetime string, weekday, transition text, title.
- Import accepts 3, 4, and 8 columns.
- Import splits on raw tab characters and does not implement quoted TSV escaping.
- Import accepts old Windows epoch timestamps when archived timestamps do not start with `U`.

## Remaining Open Questions

- Which older HTU versions must be supported beyond the current 3/4/8-column parser?
- Should exact byte round-trip preserve malformed-but-accepted rows, or only valid parsed rows?
- How should titles containing literal tabs/newlines be handled in improved mode while preserving HTU compatibility mode?
