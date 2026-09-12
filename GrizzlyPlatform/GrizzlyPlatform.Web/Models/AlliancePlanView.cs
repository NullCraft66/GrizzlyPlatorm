namespace GrizzlyPlatform.Web.Models;
public class AlliancePlanView
{
    public int EventId { get; set; }
    public string EventName { get; set; } = "";
    public long Version { get; set; }
    public int? OurTeamId { get; set; }
    public int? FirstPartnerId { get; set; }
    public int? SecondPartnerId { get; set; }
    public string Notes { get; set; } = "";
    public DateTime? UpdatedAt { get; set; }
    public List<AlliancePlanTeamView> Teams { get; set; } = new();
    public List<AllianceWishlistView> Wishlist { get; set; } = new();
    public List<AllianceSuggestionView> Suggestions { get; set; } = new();
}
public class AlliancePlanTeamView
{
    public int TeamId { get; set; }
    public int TeamNumber { get; set; }
    public string TeamName { get; set; } = "";
}
public class AllianceWishlistView
{
    public int TeamId { get; set; }
    public int Position { get; set; }
    public string Reason { get; set; } = "";
}
public class AllianceSuggestionView
{
    public Guid Id { get; set; }
    public int TeamId { get; set; }
    public string Author { get; set; } = "";
    public string Reason { get; set; } = "";
    public string Status { get; set; } = "";
    public string HostResponse { get; set; } = "";
    public DateTime CreatedAt { get; set; }
}
