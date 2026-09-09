namespace GrizzlyPlatform.Api.Models;

public class AllianceSelection
{
    public int Id { get; set; }

    public int EventId { get; set; }
    public Event? Event { get; set; }

    public string Status { get; set; } = "NotStarted";

    public int CurrentRound { get; set; }
    public int CurrentAlliance { get; set; }

    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }

    public List<Alliance> Alliances { get; set; } = new();
    public List<AlliancePick> Picks { get; set; } = new();
    public List<AllianceRankedTeam> RankedTeams { get; set; } = new();
}


