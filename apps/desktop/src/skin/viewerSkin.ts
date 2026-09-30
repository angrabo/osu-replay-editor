import { Texture } from 'pixi.js';
import type { ViewerSkin } from '@ore/beatmap-viewer';
import { readSkinFile } from '../stores/skin';

type SkinIni = {
  comboColours: number[];
  sliderBorder: number | null;
  sliderTrack: number | null;
  hitCirclePrefix: string;
  hitCircleOverlap: number;
  cursorCentre: boolean;
};

function parseColour(value: string | undefined): number | null {
  if (!value) return null;
  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length < 3 || parts.slice(0, 3).some((part) => !Number.isFinite(part))) return null;
  const [r, g, b] = parts.map((part) => Math.max(0, Math.min(255, Math.round(part))));
  return (r << 16) | (g << 8) | b;
}

/// The skin.ini values the playfield uses. Keys are case-insensitive; `//` starts a comment.
export function parseSkinIni(text: string): SkinIni {
  const sections = new Map<string, Map<string, string>>();
  let current = sections.get('general') ?? new Map<string, string>();
  sections.set('general', current);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    const header = line.match(/^\[(.+)]$/);
    if (header) {
      const name = header[1].trim().toLowerCase();
      current = sections.get(name) ?? new Map<string, string>();
      sections.set(name, current);
      continue;
    }
    const colon = line.indexOf(':');
    if (colon > 0) current.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  const colours = sections.get('colours') ?? new Map();
  const fonts = sections.get('fonts') ?? new Map();
  const general = sections.get('general') ?? new Map();
  const comboColours: number[] = [];
  for (let index = 1; index <= 8; index++) {
    const colour = parseColour(colours.get(`combo${index}`));
    if (colour !== null) comboColours.push(colour);
  }
  const overlap = Number(fonts.get('hitcircleoverlap'));
  return {
    comboColours,
    sliderBorder: parseColour(colours.get('sliderborder')),
    sliderTrack: parseColour(colours.get('slidertrackoverride')),
    hitCirclePrefix: (fonts.get('hitcircleprefix') || 'default').replace(/\\/g, '/'),
    hitCircleOverlap: Number.isFinite(overlap) ? overlap : -2,
    cursorCentre: general.get('cursorcentre') !== '0',
  };
}

const circleElements = [
  'hitcircle',
  'hitcircleoverlay',
  'sliderstartcircle',
  'sliderstartcircleoverlay',
  'approachcircle',
  'reversearrow',
  'sliderscorepoint',
  'sliderb0',
  'sliderb',
  'sliderfollowcircle',
];
const cursorElements = ['cursor', 'cursormiddle'];

async function toTexture(bytes: ArrayBuffer | null): Promise<Texture | null> {
  if (!bytes || !bytes.byteLength) return null;
  try {
    const bitmap = await createImageBitmap(new Blob([bytes]));
    return Texture.from(bitmap);
  } catch {
    return null;
  }
}

/// Loads one element: the skin's @2x image, then its normal image. Elements the skin lacks keep
/// the editor's own drawing.
async function loadElement(
  file: string,
  skin: { directory: string; name: string; files: ReadonlySet<string> },
): Promise<{ texture: Texture; hd: boolean } | null> {
  for (const [candidate, hd] of [
    [`${file}@2x.png`, true],
    [`${file}.png`, false],
  ] as const) {
    // Top-level files are listed; files in a subfolder (number prefixes) are just tried.
    if (!candidate.includes('/') && !skin.files.has(candidate.toLowerCase())) continue;
    const texture = await toTexture(await readSkinFile(skin.directory, skin.name, candidate).catch(() => null));
    if (texture) return { texture, hd };
  }
  return null;
}

const cache = new Map<string, Promise<Omit<ViewerSkin, 'circles' | 'cursor'>>>();

/// Textures and skin.ini values for a skin. Cached per skin; flags for which parts to use are
/// applied by the caller.
export function loadViewerSkin(skin: {
  directory: string;
  name: string;
  files: ReadonlySet<string>;
}): Promise<Omit<ViewerSkin, 'circles' | 'cursor'>> {
  const key = `${skin.directory}|${skin.name}|${skin.files.size}`;
  let loaded = cache.get(key);
  if (!loaded) {
    loaded = (async () => {
      const iniBytes = skin.files.has('skin.ini')
        ? await readSkinFile(skin.directory, skin.name, 'skin.ini').catch(() => null)
        : null;
      const ini = parseSkinIni(iniBytes ? new TextDecoder().decode(iniBytes) : '');
      const textures: ViewerSkin['textures'] = {};
      const names: [string, string][] = [
        ...[...circleElements, ...cursorElements].map((name) => [name, name] as [string, string]),
        ...Array.from(
          { length: 10 },
          (_, digit) => [`default-${digit}`, `${ini.hitCirclePrefix}-${digit}`] as [string, string],
        ),
      ];
      await Promise.all(
        names.map(async ([name, file]) => {
          const entry = await loadElement(file, skin);
          if (entry) textures[name] = entry;
        }),
      );
      return {
        textures,
        comboColours: ini.comboColours,
        sliderBorder: ini.sliderBorder,
        sliderTrack: ini.sliderTrack,
        hitCircleOverlap: ini.hitCircleOverlap,
        cursorCentre: ini.cursorCentre,
      };
    })();
    cache.set(key, loaded);
  }
  return loaded;
}
