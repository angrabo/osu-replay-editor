using System.Globalization;

namespace ReplayEditor.Simulation.Beatmap;

/// <summary>
/// Parses a `.osu` file's text into a <see cref="MapData"/>: mod-adjusted difficulty
/// settings, timing points, and stacked hit objects. Slider curve/duration math lives in
/// <see cref="SliderCurveBuilder"/> and <see cref="SliderTiming"/>; stacking in
/// <see cref="StableStacking"/>.
/// </summary>
internal static class BeatmapTextParser
{
    public static MapData Parse(string text, int mods)
    {
        var sections = ParseSections(text);
        var difficulty = Entries(sections, "Difficulty");
        var general = Entries(sections, "General");

        var (cs, od, ar) = ParseModAdjustedDifficulty(difficulty, mods);
        var sliderMultiplier = Number(difficulty.GetValueOrDefault("SliderMultiplier"), 1.4);
        var sliderTickRate = Math.Max(.1, Number(difficulty.GetValueOrDefault("SliderTickRate"), 1));
        var hp = Number(difficulty.GetValueOrDefault("HPDrainRate"), 5);

        var timing = ParseTimingPoints(sections);
        var objects = ParseHitObjects(sections, sliderMultiplier, timing);

        var formatVersion = DetectFormatVersion(text);
        var ordered = StableStacking.Apply(objects.OrderBy(item => item.Start).ToArray(), ar,
            Number(general.GetValueOrDefault("StackLeniency"), .7), cs, (mods & 16) != 0, formatVersion >= 6);

        var difficultyMultiplier = ComputeDifficultyMultiplier(hp, difficulty, ordered);

        return new MapData(cs, od, hp, sliderMultiplier, sliderTickRate, difficultyMultiplier, timing, ordered);
    }

    private static Dictionary<string, List<string>> ParseSections(string text)
    {
        var sections = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        var section = "";

        foreach (var raw in StripBom(text).Split('\n'))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith("//"))
                continue;

            if (line.StartsWith('[') && line.EndsWith(']'))
            {
                section = line[1..^1];
                sections.TryAdd(section, []);
                continue;
            }

            if (sections.TryGetValue(section, out var lines))
                lines.Add(line);
        }

        return sections;
    }

    private static (double Cs, double Od, double Ar) ParseModAdjustedDifficulty(Dictionary<string, string> difficulty, int mods)
    {
        var cs = Number(difficulty.GetValueOrDefault("CircleSize"), 5);
        var od = Number(difficulty.GetValueOrDefault("OverallDifficulty"), 5);
        var ar = Number(difficulty.GetValueOrDefault("ApproachRate"), od);

        if ((mods & 2) != 0)
        {
            cs *= .5;
            od *= .5;
            ar *= .5;
        }

        if ((mods & 16) != 0)
        {
            cs = Math.Min(10, cs * 1.3);
            od = Math.Min(10, od * 1.4);
            ar = Math.Min(10, ar * 1.4);
        }

        return (cs, od, ar);
    }

    private static (double Time, double BeatLength, bool Uninherited)[] ParseTimingPoints(Dictionary<string, List<string>> sections) =>
        sections.GetValueOrDefault("TimingPoints", [])
            .Select(line =>
            {
                var parts = line.Split(',');
                return (Number(parts.ElementAtOrDefault(0), 0), Number(parts.ElementAtOrDefault(1), 500),
                    parts.ElementAtOrDefault(6) != "0");
            })
            .OrderBy(point => point.Item1)
            .ToArray();

    private static List<MapObject> ParseHitObjects(Dictionary<string, List<string>> sections, double sliderMultiplier,
        (double Time, double BeatLength, bool Uninherited)[] timing)
    {
        var objects = new List<MapObject>();

        foreach (var line in sections.GetValueOrDefault("HitObjects", []))
        {
            var parts = line.Split(',');
            if (parts.Length < 5)
                continue;

            var x = Number(parts[0], 256);
            var y = Number(parts[1], 192);
            var start = Number(parts[2], 0);
            var type = (int)Number(parts[3], 0);
            var newCombo = (type & 4) != 0;

            if ((type & 8) != 0)
            {
                objects.Add(new MapObject("spinner", x, y, start, Number(parts.ElementAtOrDefault(5), start),
                    [(x, y)], 1, 0, newCombo));
            }
            else if ((type & 2) != 0 && parts.Length >= 8)
            {
                objects.Add(ParseSlider(parts, x, y, start, sliderMultiplier, timing, newCombo));
            }
            else if ((type & 1) != 0)
            {
                objects.Add(new MapObject("circle", x, y, start, start, [(x, y)], 1, 0, newCombo));
            }
        }

        return objects;
    }

    private static MapObject ParseSlider(string[] parts, double x, double y, double start, double sliderMultiplier,
        (double Time, double BeatLength, bool Uninherited)[] timing, bool newCombo)
    {
        var path = new List<(double X, double Y)> { (x, y) };
        foreach (var rawPoint in parts[5].Split('|').Skip(1))
        {
            var xy = rawPoint.Split(':');
            path.Add((Number(xy.ElementAtOrDefault(0), x), Number(xy.ElementAtOrDefault(1), y)));
        }

        var repeats = Math.Max(1, (int)Number(parts[6], 1));
        var length = Math.Max(0, Number(parts[7], 0));
        var curve = SliderCurveBuilder.BuildPath(parts[5].Split('|')[0], path.ToArray());
        var duration = SliderTiming.SliderDuration(start, length, repeats, sliderMultiplier, timing);

        return new MapObject("slider", x, y, start, start + duration, SliderCurveBuilder.FitPath(curve, length),
            repeats, SliderTiming.BeatLengthAt(start, timing), newCombo);
    }

    private static int DetectFormatVersion(string text)
    {
        var versionLine = StripBom(text).Split('\n')
            .FirstOrDefault(line => line.TrimStart().StartsWith("osu file format v", StringComparison.OrdinalIgnoreCase));
        if (versionLine is null)
            return 14;

        return (int)Number(versionLine[(versionLine.LastIndexOf('v') + 1)..].Trim(), 14);
    }

    private static int ComputeDifficultyMultiplier(double hp, Dictionary<string, string> difficulty, MapObject[] ordered)
    {
        var drainSeconds = ordered.Length < 2 ? 1 : Math.Max(1, (ordered[^1].End - ordered[0].Start) / 1000);
        var density = Math.Clamp(ordered.Length / drainSeconds * 8, 0, 16);
        var cs = Number(difficulty.GetValueOrDefault("CircleSize"), 5);
        var od = Number(difficulty.GetValueOrDefault("OverallDifficulty"), 5);

        return (int)Math.Round((hp + cs + od + density) / 38 * 5, MidpointRounding.AwayFromZero);
    }

    private static string StripBom(string text) => text.Replace("﻿", "");

    private static Dictionary<string, string> Entries(Dictionary<string, List<string>> sections, string name) =>
        sections.GetValueOrDefault(name, [])
            .Select(line =>
            {
                var index = line.IndexOf(':');
                return index > 0 ? new KeyValuePair<string, string>(line[..index].Trim(), line[(index + 1)..].Trim()) : default;
            })
            .Where(pair => pair.Key is not null)
            .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.OrdinalIgnoreCase);

    private static double Number(string? value, double fallback) =>
        double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var number) && double.IsFinite(number)
            ? number
            : fallback;
}
