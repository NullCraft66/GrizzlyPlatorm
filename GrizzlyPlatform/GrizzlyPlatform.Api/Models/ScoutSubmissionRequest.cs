namespace GrizzlyPlatform.Api.Models;

public class ScoutSubmissionRequest
{
    public int GameFormId { get; set; }

    // Required for both Pit and Match scouting.
    public int TeamNumber { get; set; }

    public string ScoutName { get; set; } = "";

    // Only used for Match scouting.
    public int? EventId { get; set; }

    public string? MatchType { get; set; }

    public int? MatchNumber { get; set; }

    public int? SetNumber { get; set; }

    public List<ScoutAnswerRequest> Answers { get; set; } = new();
}

public class ScoutAnswerRequest
{
    public int GameFormFieldId { get; set; }

    public string Value { get; set; } = "";
}