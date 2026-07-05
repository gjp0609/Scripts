# Fixtures

This directory is for compatibility and performance fixtures.

Expected layout:

```text
fixtures/
  htu/
    README.md
    chrome-htu-version-browser-version.tsv
  generated/
    large-history.json
```

Rules:

- Keep real History Trends Unlimited export files unchanged.
- Record source browser, HTU version, export date, and export option in `fixtures/htu/README.md`.
- Do not normalize line endings.
- Do not open fixture files in tools that rewrite encoding.

