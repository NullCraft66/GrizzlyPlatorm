namespace GrizzlyPlatform.Api.Models;

public class AllianceRankedTeam
{
    public int Id { get; set; }

    public int AllianceSelectionId { get; set; }
    public AllianceSelection? AllianceSelection { get; set; }

    public int TeamId { get; set; }
    public Team? Team { get; set; }

    public int Rank { get; set; }
}
