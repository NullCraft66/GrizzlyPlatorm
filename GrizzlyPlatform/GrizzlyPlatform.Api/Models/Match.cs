namespace GrizzlyPlatform.Api.Models;

public class Match
{
    public int Id { get; set; }

    public int EventId { get; set; }
    public Event? Event { get; set; }

    public string MatchType { get; set; } = "Qualification";

   public int MatchNumber { get; set; }

public int SetNumber { get; set; }

    public int RedTeam1Id { get; set; }
    public Team? RedTeam1 { get; set; }

    public int RedTeam2Id { get; set; }
    public Team? RedTeam2 { get; set; }

    public int RedTeam3Id { get; set; }
    public Team? RedTeam3 { get; set; }

    public int BlueTeam1Id { get; set; }
    public Team? BlueTeam1 { get; set; }

    public int BlueTeam2Id { get; set; }
    public Team? BlueTeam2 { get; set; }

    public int BlueTeam3Id { get; set; }
    public Team? BlueTeam3 { get; set; }
}