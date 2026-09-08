namespace GrizzlyPlatform.Api.Models;

public class AllianceMember
{
    public int Id { get; set; }

    public int AllianceId { get; set; }
    public Alliance? Alliance { get; set; }

    public int TeamId { get; set; }
    public Team? Team { get; set; }

    public int SelectionRound { get; set; }
    public int SelectionOrder { get; set; }
}
