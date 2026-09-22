# osu! Replay Editor

[![Latest release](https://img.shields.io/github/v/release/angrabo/osu-replay-editor?label=release)](https://github.com/angrabo/osu-replay-editor/releases)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D6)](#requirements-windows)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB)](https://tauri.app)

A Windows desktop editor for osu!standard replays: import one or more `.osr` files,
edit cursor movement and key presses on a timeline, resimulate the score under
stable (v1/v2) or lazer scoring, and save everything as a project you can reopen
later.

> [!WARNING]
> This tool is built for **replaying, analyzing, and cleaning up your own
> gameplay** — trimming a misclick, fixing a dropped combo on a personal FC
> attempt, or just studying a play frame by frame. It is **not** meant for
> submitting edited replays as legitimate scores, and the author does not
> condone or support using it to cheat, forge, or misrepresent gameplay. Doing
> so is on you, not this project.

## Features

- **Replay import & editing** — load several `.osr` files against the same beatmap,
  edit cursor paths and M1/M2/K1/K2 key timing directly on the timeline, cut/blade
  inputs, and undo/redo every change.
- **Multi-map projects** — switch the active beatmap without losing previously
  imported replays; each map's replays stay grouped and reachable from the Explorer.
- **Project files (`.oreproj`)** — a single file captures every track, its edits,
  the active beatmap, and view/display preferences.
- **Beatmap viewer** — a PixiJS-rendered playfield with circles, sliders,
  spinners, hidden/approach fades, and cursor trails, driven by the same clock as
  the timeline.
- **Score resimulation, three ways** — recompute accuracy, combo, and judgements
  after an edit under **stable ScoreV1**, **stable ScoreV2**, or **lazer**
  scoring, matching each ruleset's own slider and judgement behaviour.
- **osu! account integration** — sign in to resolve and download the exact
  matching beatmap difficulty for an imported replay, with cached beatmapsets for
  offline reuse.
- **Explorer** — replays grouped by beatmap, a searchable hit-object list with a
  hover preview of the object and cursor pattern, and a warning icon on any map
  that failed to resolve.
- **In-app changelog & updater** — Settings → Check for updates pulls release
  notes straight from GitHub and asks for confirmation before installing.

## Architecture

```mermaid
flowchart LR
    UI["React + TypeScript UI\n(timeline, playfield, explorer)"]
    TAURI["Tauri 2 shell\n(Rust)"]
    API["ASP.NET Core sidecar\n(loopback HTTP, nonce-protected)"]
    OSU["osu! API / beatmapset cache"]
    SIM["Simulation & scoring core"]

    TAURI -- "starts / monitors / stops" --> API
    TAURI -- "port + nonce" --> UI
    UI -- "localhost HTTP" --> API
    API --> OSU
    API --> SIM
```

The frontend never talks to the osu! API directly: the Tauri shell launches a
local ASP.NET Core sidecar on a random loopback port and hands the frontend a
one-time nonce, which the sidecar requires on every request. The sidecar owns
replay parsing, beatmap resolution/caching, authentication, and score
simulation; the UI is presentation and editing only.

## Requirements (Windows)

- Node.js 24 and npm 11
- .NET SDK 10
- Rust MSVC toolchain (`x86_64-pc-windows-msvc`)
- Microsoft Edge WebView2 Runtime and the Windows build tools required by Tauri 2

## Getting started

```powershell
npm install
npm run dev
```

`npm run dev` builds the sidecar, copies it into `apps/desktop/src-tauri/binaries`,
starts Vite, and launches the Tauri window. The first Rust build can take a few
minutes.

`npm install` creates `app.config.json` from `app.config.example.json` if it
doesn't exist yet. Fill in `osu.clientId`/`osu.clientSecret` there, or set
`OSU_CLIENT_ID`/`OSU_CLIENT_SECRET` in the environment instead, to sign in with
your own osu! OAuth client. Released builds get real values baked in by the
release workflow from repository variables — see `.github/workflows/release.yml`.

### Other useful commands

```powershell
npm run check         # TypeScript project check
npm run build          # release sidecar + Tauri package
npm run test:viewer    # frontend/unit tests (node:test)
npm run test:replay    # replay import smoke tests
npm run test:simulation
dotnet build ReplayEditor.slnx
```
