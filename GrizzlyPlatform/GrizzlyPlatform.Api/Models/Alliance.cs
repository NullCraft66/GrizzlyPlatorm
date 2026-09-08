namespace GrizzlyPlatform.Api.Models;

public class Alliance
{
    public int Id { get; set; }

    public int AllianceSelectionId { get; set; }
    public AllianceSelection? AllianceSelection { get; set; }

    public int AllianceNumber { get; set; }

    public int CaptainTeamId { get; set; }
    public Team? CaptainTeam { get; set; }

    public List<AllianceMember> Members { get; set; } = new();
}
