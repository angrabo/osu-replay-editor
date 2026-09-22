export type ChangelogEntry = {
  version: string;
  date: string;
  notes: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.1.0',
    date: '2026-09-22',
    notes: [
      'Multi-map projects: switch beatmaps without losing previously imported replays.',
      'Project files (.oreproj) save and restore tracks, view settings, and the active beatmap.',
      'Explorer groups replays by beatmap and flags maps that failed to load.',
    ],
  },
];
