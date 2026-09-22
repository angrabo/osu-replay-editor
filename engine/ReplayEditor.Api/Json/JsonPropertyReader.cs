using System.Text.Json;

namespace ReplayEditor.Api.Json;

internal static class JsonPropertyReader
{
    public static string? StringProperty(JsonElement element, string key) =>
        element.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    public static long? LongProperty(JsonElement element, string key) =>
        element.TryGetProperty(key, out var value) && value.TryGetInt64(out var number) ? number : null;
}
