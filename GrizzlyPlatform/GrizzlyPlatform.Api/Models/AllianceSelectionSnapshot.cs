namespace GrizzlyPlatform.Api.Models;

public class AllianceSelectionSnapshot
{
    public string Status { get; set; } = "";
    public int CurrentRound { get; set; }
    public int CurrentAlliance { get; set; }
    public List<AllianceSnapshot> Alliances { get; set; } = new();
}

public class AllianceSnapshot
{
    public int AllianceNumber { get; set; }
    public int CaptainTeamId { get; set; }
    public List<int> MemberTeamIds { get; set; } = new();
}
