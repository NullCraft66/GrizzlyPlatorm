namespace GrizzlyPlatform.Api.Models;

public class EventRanking
{
    public int Id { get; set; }

    public int EventId { get; set; }
    public Event? Event { get; set; }

    public int TeamId { get; set; }
    public Team? Team { get; set; }

    public int Rank { get; set; }

    public int RankingPoints { get; set; }

    public double? TieBreaker1 { get; set; }

    public double? TieBreaker2 { get; set; }
}
