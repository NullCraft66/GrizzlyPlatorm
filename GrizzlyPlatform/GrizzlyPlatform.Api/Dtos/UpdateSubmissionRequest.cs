namespace GrizzlyPlatform.Api.Dtos;

public class UpdateSubmissionRequest
{
    public List<UpdateSubmissionAnswerRequest> Answers
        { get; set; } = new();
}

public class UpdateSubmissionAnswerRequest
{
    public int GameFormFieldId { get; set; }

    public string Value { get; set; } = "";
}