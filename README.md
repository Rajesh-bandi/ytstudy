# YTStudy

YTStudy is a desktop study planner for turning YouTube courses and manually curated material into a realistic daily learning plan. It combines a local-first scheduling engine with a lesson workspace for notes, quizzes, flashcards, and optional AI assistance.

The desktop application is built with Tauri 2, React, TypeScript, and Rust. Study data lives in a local SQLite database managed by SQLx. The planner, completion history, streaks, and progress views work without an AI provider. The browser development preview intentionally uses demo data and does not connect to the configured AI provider.

## What it does

### Organize learning material

- Create playlists manually or import a YouTube playlist by URL.
- Set a daily target for each playlist, such as one lesson from one course and two problems from another.
- Keep a playlist in strict order or allow flexible ordering.
- Add, remove, and review playlist items.

### Build and recover a study plan

- Generate a plan from today until all playlist items are scheduled, respecting each playlist's daily target.
- Balance flexible items across a day's workload using difficulty labels when available.
- Move a scheduled task to another date to pin it there.
- Carry overdue tasks into available future capacity and recover missed work.
- Mark work complete or reopen it while retaining completion event history.

### Track consistency

- View current and best streaks, qualifying days, weekly and monthly totals, and period-over-period changes.
- Explore a six-month activity grid, completion trend, and playlist velocity.
- Browse work in planner and calendar views.

### Study in a lesson workspace

- Play YouTube lessons in a privacy-enhanced embedded player; open other sources externally.
- Keep editable Markdown notes with version history. Markdown supports tables, code, math, and Mermaid diagrams.
- Generate notes, quizzes, and flashcards as background jobs; review quiz attempts and rate flashcards.
- Ask questions in a lesson thread that can use the lesson description, chapters, and available captions as context.

### Use optional AI

- Configure an OpenAI-compatible endpoint and model, including local gateways such as Ollama or OmniRoute.
- Ask the global companion for progress-aware help, reorder flexible playlist items, or request a whole-plan review.
- Save the provider configuration locally in SQLite. The app makes no AI requests until a provider is configured and an AI feature is used.
- Continue using the core planner without an AI key or network connection.

### Personalize the experience

- Choose Gruvbox-inspired dark or light themes, or follow the system theme.
- Select a companion character and name.
- Reduce motion from settings; the app also respects the operating system's reduced-motion preference.

## Application modes

YTStudy has two distinct modes:

1. **Tauri desktop:** the frontend adapter invokes Rust commands; Rust stores application data in SQLite and runs scheduling and background jobs.
2. **Browser preview:** `vite dev` runs an in-memory mock implementation with demo data. The interface indicates preview mode. It is useful for frontend work, but its data is not the desktop database and AI responses are simulated.

The frontend communicates through the single adapter in `src/services/api`. The Tauri command implementation lives in `src-tauri/src/commands`; the browser mock is in `src/services/api/mock.ts`.

## Requirements

- Node.js and pnpm (the lockfile uses pnpm).
- Rust toolchain and Cargo.
- Tauri 2 Linux system libraries. On Arch Linux, install `webkit2gtk-4.1`, `gtk3`, `librsvg`, and `libappindicator-gtk3` before building.
- `yt-dlp` is optional and used to retrieve YouTube lesson metadata and captions for lesson context. On Arch Linux: `sudo pacman -S yt-dlp`.
- Linux media playback may require GStreamer H.264/VP9 codecs.

The Tauri configuration currently targets Linux packages (`deb`, AppImage, and RPM). Windows support has not been built or verified.

## Development setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/Rajesh-bandi/ytstudy.git
cd ytstudy
pnpm install
```

If pnpm reports blocked build scripts, allow the packages it identifies with `pnpm install --allow-build=<package>`.

### Browser preview

Start the Vite server. This mode uses demo data:

```bash
node_modules/.bin/vite dev --port 1420 --strictPort
```

Open <http://localhost:1420>.

### Desktop application

Build the frontend and Tauri application:

```bash
pnpm build
source "$HOME/.cargo/env"  # if Cargo is not already on PATH
cd src-tauri
cargo build
```

Run the debug executable from the repository root:

```bash
./src-tauri/target/debug/foxstudy
```

The current Rust binary is named `foxstudy` in this source checkout. The application window and Tauri bundle identify as FoxStudy; the GitHub repository and project documentation are named YTStudy.

## AI provider setup

Open **Settings → AI** and enter an OpenAI-compatible gateway URL, model name, and API key. For a local OmniRoute installation, the documented default is `http://localhost:20128/v1`. Use **Test connection**, then save the settings. Provider credentials are stored in the desktop app's local SQLite settings and are not committed to this repository.

Without a provider, the local companion can still answer basic progress questions. AI-generated content, AI ordering, and AI plan review require a configured provider. The browser preview does not make calls to your provider.

## Data, privacy, and network use

- Desktop planner data, notes, generated study artifacts, chat history, and settings are stored locally in SQLite; there is no account or synchronization service in this project.
- The planner and progress tracking do not need a network connection after the app is installed.
- YouTube playlist import needs a network connection and is best-effort. Anonymous YouTube interfaces may return only part of a large playlist; private, age-restricted, or region-blocked playlists may not import.
- YouTube playback is embedded. Other lesson URLs open in the system browser.
- Caption and metadata context uses the installed `yt-dlp` executable when available. If captions are unavailable, lesson assistance can fall back to available metadata and the user's notes.
- AI requests are sent to the endpoint configured by the user when AI features are invoked. Review that provider's privacy and retention practices before sending study material.

## Known limitations

- YouTube imports can be partial; anonymous playlist retrieval and RSS fallback have item limits.
- Captions depend on `yt-dlp` and on captions being available for the video.
- Difficulty balancing is most useful after flexible playlist items have topic and difficulty labels. Unlabelled items use a default difficulty.
- AI ordering processes up to 80 items per run.
- Plans use per-calendar-day targets. Per-playlist preferred weekdays and automatic splitting of long lessons are not implemented.
- AI responses are single-shot rather than streamed, and token/cost accounting is not implemented.
- Cross-device synchronization and backup are not implemented.
- Windows builds and release package production have not been verified.

For the implementation-level feature inventory, see [`FEATURES.md`](FEATURES.md).

## Project structure

```text
src/                         React application, features, UI, and API adapter
src/services/api/             Tauri API adapter and browser-only mock
src-tauri/src/                Rust commands, scheduler, database, AI, and jobs
src-tauri/migrations/         SQLite schema migrations
src/styles/                   Theme tokens, theme mappings, and motion rules
FEATURES.md                   Detailed feature status and known behavior
```

## Verification status

The project includes frontend and Tauri build commands above. Run them in your environment before packaging or distributing a build. This README does not claim that tests or release packages have been run for every platform.

## License

No license file is currently included. Until a license is added, standard copyright applies and reuse permissions are not explicitly granted.
