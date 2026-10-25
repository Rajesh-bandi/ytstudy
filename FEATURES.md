# YTStudy — feature status

Last updated: 23 October 2026. Tauri 2 + React/Vite, Linux-first.
Legend: **Done** · **Partial** · **Not started**

> Two runtimes, on purpose: the desktop window talks to Rust + SQLite; the
> browser tab at `localhost:1420` always runs the offline mock. The sidebar
> says **preview · demo data** when you are in the mock, and the AI settings
> page repeats it. In the browser tab, answers are simulated even with a key.

## 1. Learning engine (no AI, no network required)

| Feature | Status | Where |
| --- | --- | --- |
| Any number of playlists, each with its own daily target ("1 DP + 2 Arrays") | **Done** | `playlists.daily_target`, `scheduler.rs` |
| Import a YouTube playlist by URL | **Done** | `commands/youtube.rs` — InnerTube browse JSON → RSS → HTML, in that order |
| Import keeps the requested target, ordering and title | **Done** | `ImportInput` (camelCase) + import dialog |
| Manual playlists, add/remove items by hand | **Done** | `/playlists/:id` |
| Plan starts today and fills each playlist at its own rate | **Done** | `scheduler::rebuild` |
| Cross-playlist difficulty balance: flexible items are chosen against each day's real load (strict videos first, then the difficulty that fits) | **Done** | two-pass scheduler in `scheduler.rs` |
| Horizon derived from the work — the plan runs until every playlist is scheduled (settings value is a floor) | **Done** | `needed_days` in `scheduler::rebuild` |
| Missed day recovery | **Done** | overdue tasks are carried into free capacity on startup, on date rollover, and from **Recover overdue** |
| Strict playlists never reorder; flexible ones may | **Done** | `ordering_policy`; strict is refused by AI ordering |
| Drag a task to another day (pins it) | **Done** | `/planner` |
| Complete / uncomplete with append-only history | **Done** | `completion_events` |
| Streaks: current, best, qualifying days | **Done** | `commands/stats.rs` |
| Weekly and monthly rhythm, with previous-period deltas | **Done** | `/progress` |
| Six-month activity grid, completion trend, playlist velocity | **Done** | `/progress` |
| AI plan ordering by topic + difficulty | **Done** | `commands/ai_plan.rs`, "Order with companion" |
| Whole-plan AI review from the Planner: sees every playlist's day load, re-orders flexible work day by day, then replans | **Done** | `ai_optimize_plan`, "Optimise with AI" |
| Preferred weekdays per playlist | **Not started** | global `work_dates` exists but is unused |
| Auto-split long videos / session length | **Not started** | one item per slot |

## 2. Experience layer

| Feature | Status | Where |
| --- | --- | --- |
| Authentic Gruvbox dark + light, manual/system, saved | **Done** | `styles/tokens.css`, `themes.css` |
| Layout: ledger sidebar with live counters, editorial header, panel depth | **Done** | `components/layout/*` |
| Home: today's queue, notches, streak hero, yesterday recap, companion card | **Done** | `/` |
| Global companion dock (⌘/Ctrl+J) with live progress | **Done** | `components/companion/companion-dock.tsx` |
| Four characters (Meep, Fox, Cat, Terminal) + custom name | **Done** | `/settings` |
| Companion moods driven by real progress | **Done** | idle / focused / celebrating / encouraging |
| Background job announcements (notes/quiz/cards ready) | **Done** | `job-watcher.tsx` |
| Companion dock conversation survives a restart | **Done** | thread `companion` in `chat_messages` |
| Player keeps a true 16:9 frame at any window width | **Done** | lesson player, no max-height crop |
| Planner as a day-grouped ledger: collapsible days, difficulty and source chips, status filters, inline date move, overdue banner | **Done** | `/planner` |
| Calendar month/week | **Done** | `/calendar` |
| Reduced motion (OS + in-app) | **Done** | `motion.css`, `/settings` |
| Skeletons, empty states, readable errors | **Done** | `components/ui/*` |
| Preview-mode badge so mock data is never mistaken for real | **Done** | sidebar + AI settings |

## 3. Lesson workspace (`/learn/:itemId`)

| Feature | Status | Where |
| --- | --- | --- |
| Play a YouTube lesson inside the app | **Done** | privacy-enhanced embed, CSP allows the frame, true 16:9 frame (needs GStreamer H.264/VP9 codecs on Linux) |
| Non-YouTube sources open in the browser | **Done** | open-source button |
| Mark complete / reopen from the lesson | **Done** | player footer |
| Ask the companion doubts grounded in the lesson | **Done** | "Ask" tab |
| Lesson grounding from the video itself: description, chapters and the full caption transcript | **Done** | `ai::item_context` → `yt-dlp` metadata + captions, cached per lesson |
| Doubts conversation survives a restart (one thread per lesson) | **Done** | `chat_messages`, `list_chat` / `clear_chat` |
| Notes in Markdown: headings, tables, code, math | **Done** | `components/markdown` |
| Mermaid diagrams rendered as real figures, animated edges | **Done** | ```mermaid fences → `mermaid.tsx` |
| Generate notes with AI (includes a diagram) | **Done** | job `generate_note` |
| Regenerate keeps every version; restore writes a new version | **Done** | `note_versions` |
| Edit notes by hand | **Done** | Notes tab |
| Notes library with search + version history | **Done** | `/notes` |
| Quiz generated, taken and scored in-app | **Done** | "Quiz" tab, `/quizzes` |
| Flashcard decks with ratings | **Done** | "Cards" tab, `/flashcards` |
| Generation never blocks the UI | **Done** | SQLite queue + worker + polling |
| Playlist rows show note/quiz/card icons and open the lesson | **Done** | `/playlists/:id` |
| Animated figures beyond Mermaid | **Partial** | Mermaid edges animate; no custom animations |
| Streaming AI responses | **Not started** | single-shot |

## 4. AI layer

| Feature | Status | Where |
| --- | --- | --- |
| One OpenAI-compatible client (OmniRoute, OpenAI, OpenRouter, Groq, Ollama) | **Done** | `src-tauri/src/ai.rs` |
| Key stored only in local SQLite | **Done** | `app_settings` |
| Test connection with the typed values, before saving | **Done** | `test_ai_connection` |
| Companion sees streak, today's plan, weekly/monthly counts, playlist progress | **Done** | `ai::progress_context` injected into every prompt |
| Works with no provider: local, instant progress answers | **Done** | companion dock fallback |
| AI playlist ordering (topic clusters + difficulty ramp) | **Done** | `ai_reorder_playlist`, max 80 items per run |
| Long generations get a 240 s window (chat replies keep 90 s) | **Done** | `ai::chat_for_generation` |
| Persistent queue, retries, survives restart | **Done** | `jobs` table |
| Token/cost accounting | **Not started** | — |

## 5. Platform

| Feature | Status | Where |
| --- | --- | --- |
| Tauri 2 shell, Linux, CSP tuned for embeds and local gateways | **Done** | `src-tauri/` |
| SQLite via SQLx, idempotent migrations | **Done** | `migrations/` |
| Single adapter (`services/api`) mirrored by the mock | **Done** | `services/api/*` |
| Debug binary build + run | **Done** | `cd src-tauri && cargo build` |
| Windows build | **Partial** | portable code, never built |
| `.deb` / AppImage packaging | **Partial** | config present, not produced |
| Sync between devices / backup | **Not started** | UUIDs and revisions ready |

## Known limits (honest list)

- **YouTube import is best-effort and can return a partial list.** YouTube's
  web API currently exposes roughly the first ~60 entries of a playlist to
  anonymous requests; RSS fallback gives 15. Huge courses may need manual
  additions. Private, age-restricted or region-blocked playlists fail with a
  clear message and an inline "Create it manually instead".
- **Transcripts come from `yt-dlp`.** The app shells out to the installed
  `yt-dlp` (Arch: `pacman -S yt-dlp`) for the description and English captions;
  without it, or on a video with captions disabled, answers fall back to the
  title, your notes and the playlist. Captions are cached in SQLite, so a
  lesson is fetched once.
- **The balance uses the companion's difficulty labels.** Run *Order with
  companion* on a flexible playlist (or tick it at import) so items carry
  `topic`/`difficulty`; without labels every item counts as difficulty 3 and
  the flexible playlist simply keeps its own order. The balancing itself is
  deterministic, so it keeps working with no AI and no network.
- **AI ordering batches 80 items per run.** Larger playlists are ordered in
  the first batch; the tail keeps its relative order until a later run.
- **The browser preview never calls your provider.** It is a mock; the badge
  in the sidebar says so.
- Only YouTube URLs embed; everything else opens externally.
- Planner targets are per calendar day; there is no per-playlist weekday
  schedule yet.

## Running it

```bash
node_modules/.bin/vite dev --port 1420 --strictPort   # UI (mock in a browser)
source ~/.cargo/env && cd src-tauri && cargo build    # desktop binary
./src-tauri/target/debug/ytstudy                      # real app, real SQLite
```

AI needs **Settings → AI**: gateway URL (`http://localhost:20128/v1` for a
local OmniRoute), model name, key, **Test connection**, then **Save**.
