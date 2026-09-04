namespace GrizzlyPlatform.Web.Models;

public class EventModel
{
    public int Id { get; set; }

    public int SeasonId { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Location { get; set; } = string.Empty;

    public string? BlueAllianceKey { get; set; }

    public string EventType { get; set; } = "Competition";
}
