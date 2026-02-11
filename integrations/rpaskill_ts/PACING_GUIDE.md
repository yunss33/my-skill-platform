# Pacing Guide (Anti-bot Friendly Defaults)

This integration supports "pacing" knobs for Playwright automation to reduce anti-bot triggers on sensitive websites.

## Where pacing applies

`searchOnSite` supports these optional fields:

- `stepDelayMs` / `stepDelayJitterMs`: add a delay between major actions (goto/click/enter/type, etc.)
- `typeDelayMs` / `typeDelayJitterMs`: per-character typing delay (only used when `searchInput` is used)
- `slowMo` (browser option): Playwright global slow-motion (mainly for debugging)

`searchOnSite` can also capture artifacts:

- `capturePrefix`: file prefix for artifacts
- `captureOnBlocked`: capture when blocked/login/captcha is detected
- `captureOnDone`: capture after results are detected
- `includeHtml`, `includeElements`, `maxElements`, `captureFullPage`
- `tracePath`: JSONL trace for indexing in `outputs/...`

## Recommended presets (start here)

These are starting points. If you still see verification/limit pages, increase delays.

### Preset: fast (low risk sites)

- `stepDelayMs=150`, `stepDelayJitterMs=150`
- `typeDelayMs=30`, `typeDelayJitterMs=30`
- `slowMo=0`

### Preset: normal (search engines / common sites)

- `stepDelayMs=300`, `stepDelayJitterMs=300`
- `typeDelayMs=50`, `typeDelayJitterMs=50`
- `slowMo=0`

### Preset: cautious (ecommerce)

- `stepDelayMs=800`, `stepDelayJitterMs=600`
- `typeDelayMs=100`, `typeDelayJitterMs=80`
- optional: `slowMo=100..250` (debugging)

### Preset: very cautious (highly protected / frequent throttling)

- `stepDelayMs=1500`, `stepDelayJitterMs=1200`
- `typeDelayMs=160`, `typeDelayJitterMs=120`
- run visible (`headless=false`) and use a persistent profile if possible

## Practical notes

- Prefer increasing `stepDelay*` first. It reduces "robotic" click/submit cadence.
- If the site uses a search input, use `typeDelay*` (character-by-character typing) instead of `fill`.
- Keep `captureOnBlocked=true` so you can diagnose the exact blocker page via screenshot + DOM dump.
- If you see "too many requests" / "access limited", waiting (cool-down) often matters more than any delay knob.

