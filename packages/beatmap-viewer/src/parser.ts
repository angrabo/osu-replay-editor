export type Point = { x: number; y: number };
export type TimingPoint = { time: number; beatLength: number; uninherited: boolean };
type HitObjectBase = {
  x: number;
  y: number;
  startTime: number;
  endTime: number;
  newCombo: boolean;
  comboIndex: number;
  comboNumber: number;
};
export type HitCircle = HitObjectBase & { kind: 'circle' };
export type HitSlider = HitObjectBase & {
  kind: 'slider';
  curveType: string;
  path: Point[];
  repeats: number;
  pixelLength: number;
  spanDuration: number;
  tickDistance: number;
};
export type HitSpinner = HitObjectBase & { kind: 'spinner' };
export type HitObject = HitCircle | HitSlider | HitSpinner;

export type ParsedBeatmap = {
  audioFilename: string | null;
  backgroundFilename: string | null;
  title: string;
  artist: string;
  creator: string;
  version: string;
  circleSize: number;
  approachRate: number;
  overallDifficulty: number;
  sliderMultiplier: number;
  sliderTickRate: number;
  timingPoints: TimingPoint[];
  comboColors: number[];
  hitObjects: HitObject[];
  durationMs: number;
};

function value(line: string): [string, string] | null {
  const colon = line.indexOf(':');
  return colon > 0 ? [line.slice(0, colon).trim(), line.slice(colon + 1).trim()] : null;
}

function number(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sliderDuration(
  startTime: number,
  pixelLength: number,
  repeats: number,
  sliderMultiplier: number,
  points: TimingPoint[],
): number {
  let beatLength = 500;
  let velocity = 1;
  for (const point of points) {
    if (point.time > startTime) break;
    if (point.uninherited && point.beatLength > 0) {
      beatLength = point.beatLength;
      velocity = 1;
    } else if (!point.uninherited && point.beatLength < 0)
      velocity = Math.max(0.1, Math.min(10, -100 / point.beatLength));
  }
  return Math.max(0, (pixelLength / (Math.max(0.1, sliderMultiplier) * 100 * velocity)) * beatLength * repeats);
}

function bezierPoint(points: Point[], t: number): Point {
  const work = points.map((point) => ({ ...point }));
  for (let level = work.length - 1; level > 0; level--)
    for (let index = 0; index < level; index++) {
      work[index].x += (work[index + 1].x - work[index].x) * t;
      work[index].y += (work[index + 1].y - work[index].y) * t;
    }
  return work[0];
}

function bezierPath(points: Point[]): Point[] {
  const segments: Point[][] = [];
  let current: Point[] = [];
  for (const point of points) {
    if (current.length > 1 && point.x === current.at(-1)!.x && point.y === current.at(-1)!.y) {
      segments.push(current);
      current = [point];
    } else current.push(point);
  }
  if (current.length) segments.push(current);
  return segments.flatMap((segment, segmentIndex) => {
    const samples = Math.max(12, segment.length * 12);
    return Array.from({ length: samples }, (_, index) => bezierPoint(segment, index / (samples - 1))).filter(
      (_, index) => segmentIndex === 0 || index > 0,
    );
  });
}

function catmullPath(points: Point[]): Point[] {
  const output: Point[] = [];
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[Math.max(0, index - 1)],
      p1 = points[index],
      p2 = points[index + 1],
      p3 = points[Math.min(points.length - 1, index + 2)];
    for (let step = 0; step < 20; step++) {
      const t = step / 20,
        t2 = t * t,
        t3 = t2 * t;
      output.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  output.push(points.at(-1)!);
  return output;
}

function perfectPath(points: Point[]): Point[] | null {
  if (points.length !== 3) return null;
  const [a, b, c] = points;
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 0.001) return null;
  const aa = a.x * a.x + a.y * a.y,
    bb = b.x * b.x + b.y * b.y,
    cc = c.x * c.x + c.y * c.y;
  const center = {
    x: (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / d,
    y: (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / d,
  };
  const angle = (point: Point) => Math.atan2(point.y - center.y, point.x - center.x);
  let start = angle(a),
    middle = angle(b),
    end = angle(c);
  while (middle < start) middle += Math.PI * 2;
  while (end < start) end += Math.PI * 2;
  if (middle > end) {
    while (end > start) end -= Math.PI * 2;
  }
  const radius = Math.hypot(a.x - center.x, a.y - center.y);
  return Array.from({ length: 49 }, (_, index) => {
    const theta = start + ((end - start) * index) / 48;
    return { x: center.x + Math.cos(theta) * radius, y: center.y + Math.sin(theta) * radius };
  });
}

function sliderPath(curveType: string, controls: Point[]): Point[] {
  if (controls.length < 2 || curveType === 'L') return controls;
  if (curveType === 'C') return catmullPath(controls);
  if (curveType === 'P') return perfectPath(controls) ?? bezierPath(controls);
  return bezierPath(controls);
}

export function approachPreempt(approachRate: number): number {
  if (approachRate < 5) return 1800 - 120 * approachRate;
  return 1200 - 150 * (approachRate - 5);
}

export function parseOsu(text: string): ParsedBeatmap {
  const first = text.trimStart().split(/\r?\n/, 1)[0];
  if (!/^osu file format v\d+$/i.test(first.trim())) throw new Error('Invalid .osu header.');
  const sections = new Map<string, string[]>();
  let section = '';
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1);
      if (!sections.has(section)) sections.set(section, []);
      continue;
    }
    sections.get(section)?.push(line);
  }
  const entries = (name: string) =>
    Object.fromEntries(
      (sections.get(name) || []).map(value).filter((entry): entry is [string, string] => entry !== null),
    );
  const general = entries('General');
  const metadata = entries('Metadata');
  const difficulty = entries('Difficulty');
  const timingPoints: TimingPoint[] = (sections.get('TimingPoints') || [])
    .map((line) => {
      const parts = line.split(',');
      return { time: number(parts[0], 0), beatLength: number(parts[1], 500), uninherited: parts[6] !== '0' };
    })
    .sort((a, b) => a.time - b.time);
  const sliderMultiplier = number(difficulty.SliderMultiplier, 1.4);
  const sliderTickRate = Math.max(0.1, number(difficulty.SliderTickRate, 1));
  const hitObjects: HitObject[] = [];
  let comboIndex = 0;
  let comboNumber = 0;
  for (const line of sections.get('HitObjects') || []) {
    const parts = line.split(',');
    if (parts.length < 5) continue;
    const x = number(parts[0], 256);
    const y = number(parts[1], 192);
    const startTime = number(parts[2], 0);
    const type = number(parts[3], 0);
    const newCombo = (type & 4) !== 0;
    if (hitObjects.length === 0 || newCombo) {
      if (hitObjects.length > 0) comboIndex++;
      comboNumber = 1;
    } else comboNumber++;
    const base = { x, y, startTime, endTime: startTime, newCombo, comboIndex, comboNumber };
    if ((type & 8) !== 0)
      hitObjects.push({ ...base, kind: 'spinner', endTime: Math.max(startTime, number(parts[5], startTime)) });
    else if ((type & 2) !== 0 && parts.length >= 8) {
      const curve = parts[5].split('|');
      const controls = [
        { x, y },
        ...curve.slice(1).map((point) => {
          const [px, py] = point.split(':');
          return { x: number(px, x), y: number(py, y) };
        }),
      ];
      const repeats = Math.max(1, Math.floor(number(parts[6], 1)));
      const pixelLength = Math.max(0, number(parts[7], 0));
      const duration = sliderDuration(startTime, pixelLength, repeats, sliderMultiplier, timingPoints);
      let velocity = 1;
      for (const point of timingPoints) {
        if (point.time > startTime) break;
        if (point.uninherited) velocity = 1;
        else if (point.beatLength < 0) velocity = Math.max(0.1, Math.min(10, -100 / point.beatLength));
      }
      hitObjects.push({
        ...base,
        kind: 'slider',
        curveType: curve[0] || 'B',
        path: sliderPath(curve[0] || 'B', controls),
        repeats,
        pixelLength,
        spanDuration: duration / repeats,
        tickDistance: (sliderMultiplier * 100 * velocity) / sliderTickRate,
        endTime: startTime + duration,
      });
    } else if ((type & 1) !== 0) hitObjects.push({ ...base, kind: 'circle' });
  }
  hitObjects.sort((a, b) => a.startTime - b.startTime);
  let backgroundFilename: string | null = null;
  for (const event of sections.get('Events') || []) {
    const match = event.match(/^0\s*,\s*0\s*,\s*"([^"]+)"/);
    if (match) {
      backgroundFilename = match[1];
      break;
    }
  }
  const comboColors = (sections.get('Colours') || []).flatMap((line) => {
    const pair = value(line);
    if (!pair || !/^Combo\d+$/i.test(pair[0])) return [];
    const rgb = pair[1].split(',').map((part) => Math.max(0, Math.min(255, number(part, 255))));
    return rgb.length === 3 ? [(rgb[0] << 16) | (rgb[1] << 8) | rgb[2]] : [];
  });
  return {
    audioFilename: general.AudioFilename || null,
    backgroundFilename,
    title: metadata.TitleUnicode || metadata.Title || 'Untitled',
    artist: metadata.ArtistUnicode || metadata.Artist || 'Unknown artist',
    creator: metadata.Creator || 'Unknown mapper',
    version: metadata.Version || 'Unknown difficulty',
    circleSize: number(difficulty.CircleSize, 5),
    approachRate: number(difficulty.ApproachRate, number(difficulty.OverallDifficulty, 5)),
    overallDifficulty: number(difficulty.OverallDifficulty, 5),
    sliderMultiplier,
    sliderTickRate,
    timingPoints,
    comboColors: comboColors.length ? comboColors : [0x66ccff, 0xff77aa, 0x88dd66, 0xcc88ff],
    hitObjects,
    durationMs: Math.max(1, ...hitObjects.map((object) => object.endTime + 1200)),
  };
}

export function applyPreviewMods(beatmap: ParsedBeatmap, mods: number): ParsedBeatmap {
  const easy = (mods & 2) !== 0;
  const hardRock = (mods & 16) !== 0;
  const difficulty = (value: number, hardRockFactor: number) =>
    Math.min(10, value * (easy ? 0.5 : 1) * (hardRock ? hardRockFactor : 1));
  return {
    ...beatmap,
    circleSize: difficulty(beatmap.circleSize, 1.3),
    approachRate: difficulty(beatmap.approachRate, 1.4),
    overallDifficulty: difficulty(beatmap.overallDifficulty, 1.4),
    hitObjects: hardRock
      ? beatmap.hitObjects.map((object) =>
          object.kind === 'slider'
            ? { ...object, y: 384 - object.y, path: object.path.map((point) => ({ ...point, y: 384 - point.y })) }
            : { ...object, y: 384 - object.y },
        )
      : beatmap.hitObjects,
  };
}
