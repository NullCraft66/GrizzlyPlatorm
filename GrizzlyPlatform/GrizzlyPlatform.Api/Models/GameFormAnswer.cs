using System.Text.Json.Serialization;

namespace GrizzlyPlatform.Api.Models;

public class GameFormAnswer
{
    public int Id { get; set; }

    public int GameFormSubmissionId { get; set; }

    [JsonIgnore]
    public GameFormSubmission? GameFormSubmission { get; set; }

    public int GameFormFieldId { get; set; }

    public GameFormField? GameFormField { get; set; }

    public string Value { get; set; } = "";
}