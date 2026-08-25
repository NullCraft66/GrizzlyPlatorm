using System.ComponentModel.DataAnnotations;

namespace GrizzlyPlatform.Api.Models;

public class Team
{
    public int Id { get; set; }

    [Range(1, int.MaxValue)]
    public int TeamNumber { get; set; }

    [Required]
    public string Name { get; set; } = string.Empty;

    [Required]
    public string Location { get; set; } = string.Empty;

    public ICollection<EventTeam> EventTeams { get; set; } = new List<EventTeam>();
}