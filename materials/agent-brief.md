# Agent brief - shared by every fan-out page of learn-llm-inference-with-phoebe

Internal build document. Never linked from an audience page.

You are writing ONE static HTML session page. No servers, no npm. **If your target file already
exists on disk, do not write it; report that and stop.** Write the file, return its path and one
line of coverage. No HTML in your reply.

## Read first, in this order

1. The template page. Copy its structure, classes, SVG grammar and quiz markup EXACTLY, including
   4 options per quiz question and the script tags at the bottom:
   `/Users/phoebe.fu/Documents/claude_work/github_repo/learn-llm-inference-with-phoebe/courses/01-where-the-money-goes.html`
   For how the bench widgets are placed and introduced (h3 + a sentence naming what the widget will
   print, then the div), also skim the "bench" section of
   `/Users/phoebe.fu/Documents/claude_work/github_repo/learn-llm-inference-with-phoebe/courses/06-the-serving-bench.html`.
2. The source map: every verified number, its evidence tier, per-session coverage, the seams, the
   canon table. Use ONLY its numbers; never invent a statistic; if a fact is missing, teach the
   uncertainty. `/Users/phoebe.fu/Documents/claude_work/github_repo/learn-llm-inference-with-phoebe/materials/official-course-map.md`
3. The stylesheet `:root` block (first 30 lines) for the palette tokens:
   `/Users/phoebe.fu/Documents/claude_work/github_repo/learn-llm-inference-with-phoebe/assets/style.css`

## Page skeleton (keep every component)

toolbar (crumb EXACTLY `<a href="../index.html">learn-llm-inference-with-phoebe</a> / Session N of 6`,
#toggle-all, #zoom-toggle) · masthead (eyebrow "Learn LLM Inference and Model Serving with Phoebe ·
Session N of 6", h1 with one `<span class="accent">`, .sub, .chip-row with the level chip 🟡 Core
(sessions 2, 3) or 🟠 Deeper (sessions 4, 5), two .chip.audience, .chip.time "45 min", .agenda a1-a4) ·
main.wrap · section#intro (Part 0: kicker, .lede that opens "Constructed Kiln example.", .legend pills as
in the template, .callout.win "★ What you walk out with tonight.") · 3 Parts, each
`section.section#part-N` with section-kicker (klabel "Part N · covers ...", h2, `.tag.concept "N min
live"`), a `.lede`, ONE figure, `details.card` accordions (summary: `.mode.live` or `.mode.self`, title,
`.mini`, `.caret ▶`), at least one `.callout.example` with `span.ex-pill` "Real world" on the page ·
section#demo-1 Build-along (kicker klabel "Build-along", h2, `.tag.demo "★ 22 min · everyone builds"`,
.lede, ONE figure, then the widget div named in your outline, then `.steps > .step`, each step a `p`
followed by a `.prompt-box.good` carrying a `span.label`; then a `.callout.tip` "Your numbers will
differ." line) · section#exercise Homework (ol, 4 items) · section#quiz (3 x `.quiz-q
data-answer="0-based"`, `p.qtext`, 4 x `button.qopt` "A · ...", `p.qwhy`; one `p.quiz-score` after the
last; vary the correct letter) · section#official, h2 EXACTLY "What this session teaches, and where it
came from", `.covered > .covered-row` (pill solid ✓ / light ◐ + name + note), then the `.mono` line
EXACTLY "Every fact on this page, and its verification tier, is recorded in the course's source map." ·
section.cheat#cheatsheet (h3 "Session N cheat sheet <span>· pin this</span>", .grid-2 of six
.cheat-item) · `.callout.next` with `.nx-pill` "Next session" · footer.pagefoot.

Bottom of body, exactly (the widgets need all four):
```
<script src="../assets/inf-sample.js?v=1"></script>
<script src="../assets/inf-live.js?v=1"></script>
<script src="../assets/inf-ui.js?v=1"></script>
<script src="../assets/app.js?v=1"></script>
```

Head: the template's social meta block with this page's own title/description/url
(`https://phoebefu6.github.io/learn-llm-inference-with-phoebe/courses/<file>`);
`<title>Session N · <Title> - learn llm inference with phoebe</title>`;
`<link rel="stylesheet" href="../assets/style.css?v=1">`. Nothing else external.

First `details.card` in the FIRST Part is `open`; no other. Sentence case headings. Warm practitioner
voice, concrete, never dry. Inside prompt-boxes escape `&` `<` `>`. 450 to 650 lines is guidance about
depth, never a target: never collapse whitespace, dissolve a list into a paragraph, or drop a component.

## Hard rules (a violation is rework)

- NEVER an em dash or en dash, anywhere (prose, code, aria-labels, comments). Hyphen only.
- No meta text: never "this course", "in this course", "the course teaches", "banned here". State the
  professional norm directly with its reason. "session 5" cross-references are fine.
- Attribution "by Phoebe Fu". Never "built with" a tool.
- **Every number on the page must be one a widget prints or one the source map lists** (canon tables,
  prices, paper facts). Copy the widget's exact string ("95.7%", "$2.49", "0.75 req/s", "345 ms"). If you
  want a number that is not there, write the sentence without it. Arithmetic you do yourself on two
  printed numbers (a difference, a ratio) is allowed only if stated as such.
- Label every capacity / GPU time number as modelled (the widgets do). Router, token and cost numbers
  from the real rows are "computed". Kiln and its constants are constructed.
- Contested evidence: teach the disagreement (map section "Teach the disagreement"); never resolve it.
- Citations in the exact form of the map's appendix; anything marked [R] is "reported". Never quote
  "60-80% waste" or "under 4%" for PagedAttention: they are not in the paper.
- NEVER "lottery" or "lotteries". Default to English words.
- Running case: "Constructed Kiln example" in the intro lede and wherever Kiln's numbers appear.
  People: Maya (platform engineer), Theo (product lead). Never real companies as Kiln.
- Titles, widget ids and class names must not collide with siblings. Avoid case names Larkline,
  Beacon, Callwell, Cadence, DataDesk, Lanternfish. Do not reuse h1/h2 strings from the fine-tuning,
  observability, agent-launch or voice siblings.
- Seams: link (absolute https, from the map's Seams section) and never reteach: fine-tuning break-even
  (session 3 links it), cache accounting (session 5 links observability a4/b4), launch SLOs (session 3
  may link agent-launch b3).

## Figure grammar (hand-drawn, every figure)

Palette, ONLY these hexes (no invented greys): accent `#B82500`, deep `#7A1A04`, mid `#9C2301`, soft
`#F2B49C`, tint `#FDEFE8`, ink `#2B1712`, muted `#6E4A3F`, faint `#E2C3B7`, hairline `#F3E3DC`, contrast
slate teal `#145868`, contrast ink `#0E3F4B`, warm tint `#FFF1E0`, glow `#FFB48C` (ink text only on it),
paper `#FFFCFA` · `#FFFFFF` · universal reds `#991B1B` `#FEF2F2` `#FCA5A5` only for a wrong-way panel.
White text only on `#B82500`, `#7A1A04`, `#9C2301`, `#145868`, `#0E3F4B`.

- `<figure class="zoomable">` > `<svg viewBox="0 0 880 H" xmlns="http://www.w3.org/2000/svg" role="img"
  aria-label="the data, not the shape">` > `<defs>` + `<style>` + content, then
  `<figcaption>🔍 Click to zoom - takeaway</figcaption>`. Grow H, never W.
- Prefix unique per figure, used for every class and id: `p<session><letter>`, e.g. `p2a`, `p2b`,
  `p2c`, `p2d` (session 2's four figures). Never reuse a prefix from another page's figures.
- `<defs>` holds the wobble filter `id="PSk"` (copy the template's feTurbulence + feDisplacementMap with
  your own seed), a hachure pattern `id="PHc"` (7x7, rotate(-38), one `#B82500` line, opacity .5), an open
  arrowhead `id="PAr"`. ALL shapes sit inside ONE `<g filter="url(#PSk)" fill="none" stroke="#2B1712"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`; rects carry a tiny rotation (under 1
  degree for panels). Fills: white, tint, the hachure for "the pile", and the contrast colour ONLY for the
  one thing the figure is about. Text classes as in the template (`.PH` 800 12px ink heading, `.PL` 600 12px
  ink label, `.PS` 400 11px muted, `.PB` 800 11px contrast ink, `.PV` 800 16-18px deep value, `.PW` 800 12px
  white on a fill, `.PN` 400 12px muted note).
- ALL `<text>` outside any filtered group, sans stack, never below 11px.
- Fit: max chars ≈ (box width - 20) / 7 at 12px, 6.4px/char at 11px; full-width note under 110 chars;
  40px between neighbouring labels; bottom note 22px below the last row, H clears it by 8px. No line,
  arrow or path may cross a label (the gate flags line-through-text): route arrows in clear space.
  When in doubt, shorten.
- Floor: one figure per Part plus one in the build-along (4 figures). Draw the MECHANISM, never a
  metaphor literally, never decoration.

## Widgets (the engine computes; you only place the div and quote what it prints)

- `<div class="inf-widget" data-part="router" data-policy="learned" data-t="870"></div>`: policy presets
  (learned, length, everything big, everything small, hindsight), threshold slider 0.70-0.95, length cut,
  price preset, scramble break button. Prints: sent small %, acceptable %, weak answers shipped, cost per
  1,000, saving %, router AUC; a cost against quality chart.
- `<div class="inf-widget" data-part="capacity" data-w="bf16|fp8|int8|int4" data-lam="0.75" [data-prefix="1"]></div>`:
  GPU, model, weights, KV precision, batching (continuous / static), KV memory (paged / reserved 4,096),
  prefix cache, load. Prints: weights GB, KV per token KB, KV pool tokens, concurrent requests, decode ms
  per token alone, p95 and p50 TTFT, throughput, mean batch; a "Run the load sweep" button prints max load
  at the 1 s target, cost per 1,000 requests, cost per 1M output tokens, one GPU-month.
- `<div class="inf-widget" data-part="cache"></div>`: layout presets (dynamic first, static first), model
  (Sonnet 4.5, Haiku 4.5, gpt-4.1), hit rate, answer cache (off, short, long). Prints: no-cache, with
  prompt cache, after answer cache (per 1,000), wrong cached answers per 1,000, write premium break-even.
- One widget per build-along is enough; the steps tell the learner which settings to pick and quote the
  exact strings from the canon tables in the map.

## Voice and honesty

Every Part gets a real-world story from the map's sources (a paper result, a vendor doc line, a price
page). Constructed Kiln numbers say constructed. The capacity model is a roofline plus a seeded queue: say
"modelled" and, at least once per page that uses it, that it is optimistic against vLLM's reported 13 ms
per token. The quality rows are GPT-4 against Mixtral 8x7B; the capacity model is Llama 3.1 8B; say they
are different small models where it matters.

## Cross-links (absolute URLs)

From the map's Seams section. Hub: https://phoebefu6.github.io/learn-with-phoebe/

## Footer chain and session titles

Footer left: "Session N of 6 · learn-llm-inference-with-phoebe · by Phoebe Fu &nbsp;·&nbsp; 📚 <a
href="https://phoebefu6.github.io/learn-with-phoebe/">Learn with Phoebe ↗</a>"
Footer right: `<a href="PREV">← Prev: SHORT</a> &nbsp;·&nbsp; <a href="NEXT">Next: SHORT →</a>`

| N | File | Title (exact; one accent span in h1) | Short |
|---|------|------|------|
| 1 | 01-where-the-money-goes.html | Where the money and the milliseconds go | Where the money goes |
| 2 | 02-routing.html | Routing: not every question needs the big model | Routing |
| 3 | 03-batching.html | Batching and the GPU you rent | Batching |
| 4 | 04-quantised-serving-and-kv-cache.html | Quantised serving and the KV cache | Quantised serving |
| 5 | 05-caching-as-a-cost-lever.html | Caching as a cost lever | Caching as a cost lever |
| 6 | 06-the-serving-bench.html | The serving bench: Kiln's serving plan | The serving bench |
