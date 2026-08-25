namespace GrizzlyPlatform.Api.Models;

public class ScoutSubmissionRequest
{
    public int GameFormId { get; set; }

    public int EventId { get; set; }

    public string MatchType { get; set; } = "Qualification";

    public int MatchNumber { get; set; }

    public int SetNumber { get; set; }

    public int TeamNumber { get; set; }

    public List<ScoutAnswerRequest> Answers { get; set; } = new();
}

public class ScoutAnswerRequest
{
    public int GameFormFieldId { get; set; }

    public string Value { get; set; } = "";
}
