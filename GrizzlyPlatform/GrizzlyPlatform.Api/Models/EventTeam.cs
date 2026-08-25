namespace GrizzlyPlatform.Api.Models;

public class EventTeam
{
    public int Id { get; set; }

    public int EventId { get; set; }
    public Event? Event { get; set; }

    public int TeamId { get; set; }
    public Team? Team { get; set; }
}