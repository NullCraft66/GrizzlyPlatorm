namespace GrizzlyPlatform.Api.Models;

public class GameFormSubmissionRequest
{
    public int GameFormId { get; set; }

    public int MatchId { get; set; }

    public int TeamId { get; set; }

    public List<GameFormAnswerRequest> Answers { get; set; }
        = new();
}

public class GameFormAnswerRequest
{
    public int GameFormFieldId { get; set; }

    public string Value { get; set; } = "";
}