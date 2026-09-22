using ReplayEditor.Contracts;
using ReplayEditor.Core;

namespace ReplayEditor.Engine.Services;

/// <summary>
/// Reads and writes .osr replay files. Owns the codec/domain logic so controllers stay thin.
/// </summary>
public interface IReplayCodecService
{
    ReplayHeader ReadHeader(Stream body);

    ParsedReplayResponse ParseReplay(byte[] bytes);

    ReplayExportResult ExportReplay(ReplayExportRequest request);
}
