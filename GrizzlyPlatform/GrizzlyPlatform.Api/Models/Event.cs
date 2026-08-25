namespace GrizzlyPlatform.Api.Models;

public class Event
{
    public int Id { get; set; }

    public int SeasonId { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Location { get; set; } = string.Empty;

    public Season? Season { get; set; }

    public ICollection<EventTeam> EventTeams { get; set; } = new List<EventTeam>();

    public string? BlueAllianceKey { get; set; }

    public string EventType { get; set; } = "Competition";
}