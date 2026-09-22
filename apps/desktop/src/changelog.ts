export type ChangelogEntry = {
  version: string;
  date: string;
  body: string;
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.1.2',
    date: '2026-09-22',
    body: `## First working release of the osu! Replay Editor!

This is an early build — a lot is still missing, but the core editing loop works end to end.

### Current features

- **Replay import & editing** — load one or more \`.osr\` files against a beatmap, edit cursor movement and M1/M2/K1/K2 key timing directly on the timeline, cut/blade inputs, full undo/redo.
- **Multi-map projects** — switch the active beatmap without losing previously imported replays; each map's replays stay grouped and reachable from the Explorer.
- **Project files (\`.oreproj\`)** — save every track, its edits, the active beatmap, and view preferences to a single file and reopen it later.
- **Beatmap viewer** — PixiJS-rendered playfield with circles, sliders, spinners, hidden/approach fades, and cursor trails, synced to the timeline.
- **Score resimulation** — recompute accuracy, combo, and judgements after an edit, matching osu!(lazer) slider and scoring behaviour.
- **osu! account integration** — sign in to resolve and download the exact matching beatmap difficulty for an imported replay, with cached beatmapsets for offline reuse.
- **In-app changelog & update check** — Settings → Check for updates, with a confirm-before-install flow instead of a silent auto-update.

### Known gaps

- No waveform, no export back to \`.osr\` yet.
- Windows-only, no signed release history before this one.`,
  },
];
