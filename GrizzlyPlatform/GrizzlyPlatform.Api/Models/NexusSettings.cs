namespace GrizzlyPlatform.Api.Models;

/// <summary>
/// Settings submitted by the host administrator. The API key is never returned
/// by the settings endpoint; it is encrypted before being written to disk.
/// </summary>
public sealed class NexusSettings
{
    public string ApiKey { get; set; } = "";
    public string EventKey { get; set; } = "";
    public bool Enabled { get; set; }
}
