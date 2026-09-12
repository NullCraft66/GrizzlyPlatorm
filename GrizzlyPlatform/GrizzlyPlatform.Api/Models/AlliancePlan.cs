namespace GrizzlyPlatform.Api.Models;

public class AlliancePlan
{
    public int EventId { get; set; }
    public long Version { get; set; }
    public int? OurTeamId { get; set; }
    public int? FirstPartnerId { get; set; }
    public int? SecondPartnerId { get; set; }
    public string Notes { get; set; } = "";
    public DateTime? UpdatedAt { get; set; }
    public List<AlliancePlanEntry> Wishlist { get; set; } = new();
}
public class AlliancePlanEntry
{
    public int EventId { get; set; }
    public int TeamId { get; set; }
    public int Position { get; set; }
    public string Reason { get; set; } = "";
}
public class AlliancePlanSuggestion
{
    public Guid Id { get; set; }
    public int EventId { get; set; }
    public int TeamId { get; set; }
    public string Author { get; set; } = "";
    public string Reason { get; set; } = "";
    public string Status { get; set; } = "Pending";
    public string HostResponse { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime? ReviewedAt { get; set; }
}
