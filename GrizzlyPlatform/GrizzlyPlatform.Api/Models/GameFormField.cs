namespace GrizzlyPlatform.Api.Models;

public class GameFormField
{
    public int Id { get; set; }

    public int GameFormId { get; set; }

    public string Question { get; set; } = "";

    public string Description { get; set; } = "";

    public GameFormFieldType FieldType { get; set; }

    public bool Required { get; set; }

    public int DisplayOrder { get; set; }

    public bool IsSystemField { get; set; }

    [System.Text.Json.Serialization.JsonIgnore]
    public GameForm? GameForm { get; set; }

    public ICollection<GameFormFieldOption> Options { get; set; }
        = new List<GameFormFieldOption>();
}