namespace GrizzlyPlatform.Api.Models;
public class EventSyncState
{
    public int EventId { get; set; }
    public string Resource { get; set; } = "";
    public bool ManualMode { get; set; }
    public long Revision { get; set; }
    public DateTime? LastAttemptAt { get; set; }
    public DateTime? LastSuccessAt { get; set; }
    public DateTime? LastChangedAt { get; set; }
    public string Outcome { get; set; } = "Never";
    public string Message { get; set; } = "No synchronization attempted yet.";
}
