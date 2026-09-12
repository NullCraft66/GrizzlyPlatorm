namespace GrizzlyPlatform.Api.Models;

public class ActiveScoutingConfiguration
{
    public int Id { get; set; }

    public int? ActivePitFormId { get; set; }

    public int? ActiveMatchFormId { get; set; }

    public int? ActiveSeasonId { get; set; }

    public int? ActiveEventId { get; set; }
}
