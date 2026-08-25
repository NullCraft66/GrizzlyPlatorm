namespace GrizzlyPlatform.Api.Models;

public class GameFormFieldOption
{
    public int Id { get; set; }

    public int GameFormFieldId { get; set; }

    public string Value { get; set; } = "";

    public int DisplayOrder { get; set; }

    public GameFormField? GameFormField { get; set; }
}