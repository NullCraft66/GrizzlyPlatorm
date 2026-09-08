namespace GrizzlyPlatform.Api.Models;

public class AlliancePick
{
    public int Id { get; set; }

    public int AllianceSelectionId { get; set; }
    public AllianceSelection? AllianceSelection { get; set; }

    public int AllianceNumber { get; set; }

    public int Round { get; set; }
    public int PickOrder { get; set; }

    public int? InvitingTeamId { get; set; }
    public Team? InvitingTeam { get; set; }

    public int InvitedTeamId { get; set; }
    public Team? InvitedTeam { get; set; }

    public string Result { get; set; } = "Pending";

    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}
