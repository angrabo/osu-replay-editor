using System.IO.Compression;
using System.Security.Cryptography;
using Microsoft.Win32;
using Realms;
using Realms.Exceptions;
using ReplayEditor.Core;
using ReplayEditor.Osu;

namespace ReplayEditor.Api.Beatmaps;

public sealed record LocalBeatmapLocations(string? Stable, string? Lazer);

/// <summary>Reads installed clients without changing their files or Realm database.</summary>
internal sealed class LocalBeatmapResolver(BeatmapCache cache)
{
    public LocalBeatmapLocations Detect() => new(DetectStable(), DetectLazer());

    public async Task<MapResolution> ResolveAsync(string hash, string client, string? directory, CancellationToken ct)
    {
        if (!ReplayHeaderReader.IsMd5(hash))
            return MapResolutions.Empty("invalid", hash, "Invalid beatmap checksum.");
        hash = hash.ToLowerInvariant();

        var cached = cache.FindCached(hash);
        if (cached is not null)
            return MapResolutions.FromPackage(hash, cached, null);

        var location = string.IsNullOrWhiteSpace(directory)
            ? client == "stable" ? DetectStable() : client == "lazer" ? DetectLazer() : null
            : directory;
        if (location is null)
            return MapResolutions.Empty("not-found", hash, $"osu!{client} installation was not found.");

        try
        {
            var root = Path.GetFullPath(location);
            var files = client switch
            {
                "stable" => await Task.Run(() => FindStableFiles(root, hash, ct), ct),
                "lazer" => await Task.Run(() => FindLazerFiles(root, hash, ct), ct),
                _ => null,
            };
            if (files is null)
                return MapResolutions.Empty("not-found", hash, $"Exact difficulty not found in osu!{client}.");

            var archive = await Task.Run(() => Pack(files, ct), ct);
            var package = BeatmapArchive.InspectOsz(archive, hash, $"osu-{client}");
            if (package.ExactDifficulty is null)
                return MapResolutions.Empty("not-found", hash, "Local set did not contain the exact replay difficulty.");
            var path = await cache.CacheAsync(archive, null, ct);
            return MapResolutions.FromPackage(hash, package with { ArchivePath = path }, null);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidDataException or OverflowException or RealmException)
        {
            return MapResolutions.Empty("not-found", hash, $"Could not read osu!{client}: {ex.Message}");
        }
    }

    private static List<(string Name, string Path)>? FindStableFiles(string root, string hash, CancellationToken ct)
    {
        var songs = Path.GetFileName(root.TrimEnd(Path.DirectorySeparatorChar)).Equals("Songs", StringComparison.OrdinalIgnoreCase)
            ? root : Path.Combine(root, "Songs");
        if (!Directory.Exists(songs)) return null;

        var options = new EnumerationOptions
        {
            RecurseSubdirectories = true,
            IgnoreInaccessible = true,
            AttributesToSkip = FileAttributes.ReparsePoint,
        };
        foreach (var path in Directory.EnumerateFiles(songs, "*.osu", options))
        {
            ct.ThrowIfCancellationRequested();
            if (new FileInfo(path).Length > 16 * 1024 * 1024) continue;
            using var stream = File.OpenRead(path);
            var checksum = Convert.ToHexString(MD5.HashData(stream));
            if (!checksum.Equals(hash, StringComparison.OrdinalIgnoreCase)) continue;
            var folder = Path.GetDirectoryName(path)!;
            return Directory.EnumerateFiles(folder, "*", options)
                .Select(file => (Path.GetRelativePath(folder, file).Replace('\\', '/'), file))
                .ToList();
        }
        return null;
    }

    private static List<(string Name, string Path)>? FindLazerFiles(string root, string hash, CancellationToken ct)
    {
        var realmPath = Path.GetFileName(root).Equals("client.realm", StringComparison.OrdinalIgnoreCase)
            ? root : Path.Combine(root, "client.realm");
        if (!File.Exists(realmPath)) return null;
        var filesRoot = Path.Combine(Path.GetDirectoryName(realmPath)!, "files");
        var config = new RealmConfiguration(realmPath) { IsReadOnly = true, IsDynamic = true };
        using var realm = Realm.GetInstance(config);
        foreach (var beatmap in realm.DynamicApi.All("Beatmap"))
        {
            ct.ThrowIfCancellationRequested();
            if (!string.Equals(beatmap.DynamicApi.Get<string?>("MD5Hash"), hash, StringComparison.OrdinalIgnoreCase))
                continue;
            var set = beatmap.DynamicApi.Get<IRealmObjectBase?>("BeatmapSet");
            if (set is null) continue;
            var files = new List<(string Name, string Path)>();
            foreach (var usage in set.DynamicApi.GetList<IRealmObjectBase>("Files"))
            {
                var name = usage.DynamicApi.Get<string?>("Filename");
                var fileHash = usage.DynamicApi.Get<IRealmObjectBase?>("File")?.DynamicApi.Get<string?>("Hash");
                if (name is null || !SafeName(name) || fileHash is null || fileHash.Length != 64 ||
                    !fileHash.All(Uri.IsHexDigit)) continue;
                var path = Path.Combine(filesRoot, fileHash[..1], fileHash[..2], fileHash);
                if (File.Exists(path)) files.Add((name.Replace('\\', '/'), path));
            }
            if (files.Any(file => file.Name.EndsWith(".osu", StringComparison.OrdinalIgnoreCase)))
                return files;
        }
        return null;
    }

    private static byte[] Pack(List<(string Name, string Path)> files, CancellationToken ct)
    {
        if (files.Count > 4096) throw new InvalidDataException("Too many files in local beatmapset.");
        using var buffer = new MemoryStream();
        using (var zip = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (name, path) in files)
            {
                ct.ThrowIfCancellationRequested();
                if (!SafeName(name) || new FileInfo(path).Length > BeatmapArchive.MaxArchiveBytes)
                    throw new InvalidDataException("Local beatmapset contains an unsafe or oversized file.");
                var entry = zip.CreateEntry(name.Replace('\\', '/'), CompressionLevel.Fastest);
                using var source = File.OpenRead(path);
                using var target = entry.Open();
                source.CopyTo(target);
                if (buffer.Length > BeatmapArchive.MaxArchiveBytes)
                    throw new InvalidDataException("Local beatmapset exceeds the archive size limit.");
            }
        }
        return buffer.ToArray();
    }

    private static bool SafeName(string name) =>
        !string.IsNullOrWhiteSpace(name) && !name.StartsWith(['/', '\\']) && !name.Contains(':') &&
        name.Split(['/', '\\']).All(part => part is not ("" or "." or "..") && !part.Any(char.IsControl));

    private static string? DetectStable()
    {
        var candidates = new List<string>();
        if (OperatingSystem.IsWindows())
        {
            foreach (var key in new[] { @"osu\Shell\Open\Command", @"osustable.File.osz\Shell\Open\Command" })
            {
                var command = Registry.ClassesRoot.OpenSubKey(key)?.GetValue(null) as string;
                if (command?.StartsWith('"') == true)
                {
                    var end = command.IndexOf('"', 1);
                    if (end > 1) candidates.Add(Path.GetDirectoryName(command[1..end])!);
                }
            }
        }
        candidates.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "osu!"));
        foreach (var drive in DriveInfo.GetDrives().Where(d => d.IsReady))
            foreach (var name in new[] { "osu", "osu!", "Games/osu!" })
                candidates.Add(Path.Combine(drive.RootDirectory.FullName, name));
        return candidates.FirstOrDefault(path => Directory.Exists(Path.Combine(path, "Songs")));
    }

    private static string? DetectLazer()
    {
        var candidates = new List<string> { Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "osu") };
        foreach (var drive in DriveInfo.GetDrives().Where(d => d.IsReady))
            foreach (var name in new[] { "osu-lazer", "osu!lazer", "Games/osu-lazer" })
                candidates.Add(Path.Combine(drive.RootDirectory.FullName, name));
        return candidates.Where(path => File.Exists(Path.Combine(path, "client.realm")) && Directory.Exists(Path.Combine(path, "files")))
            .OrderByDescending(path => new FileInfo(Path.Combine(path, "client.realm")).Length)
            .FirstOrDefault();
    }
}
