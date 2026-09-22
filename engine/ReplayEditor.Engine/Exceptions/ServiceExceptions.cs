namespace ReplayEditor.Engine.Exceptions;

/// <summary>
/// Request shape/content failed validation; maps to HTTP 400.
/// </summary>
public sealed class RequestValidationException(string message) : Exception(message);

/// <summary>
/// A referenced resource (e.g. the exact beatmap difficulty) is unavailable; maps to HTTP 404.
/// </summary>
public sealed class ResourceNotFoundException(string message) : Exception(message);

/// <summary>
/// A codec or engine operation failed on otherwise well-formed input; maps to HTTP 400.
/// </summary>
public sealed class OperationFailedException(string message, Exception inner) : Exception(message, inner);

/// <summary>
/// No unique output path could be produced; maps to HTTP 500 (Problem).
/// </summary>
public sealed class ExportExhaustedException(string message) : Exception(message);
