using System.Text.Json.Serialization;

namespace GrizzlyPlatform.Api.Models;

public class GameFormSubmission
{
    public int Id { get; set; }

    public int GameFormId { get; set; }

    public GameForm? GameForm { get; set; }

    public int MatchId { get; set; }

    public Match? Match { get; set; }

    public int TeamId { get; set; }

    public Team? Team { get; set; }

    public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;

    public ICollection<GameFormAnswer> Answers { get; set; }
        = new List<GameFormAnswer>();
}