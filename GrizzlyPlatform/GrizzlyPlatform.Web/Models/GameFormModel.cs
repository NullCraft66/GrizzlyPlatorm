namespace GrizzlyPlatform.Web.Models;

public class GameFormModel
{
    public int Id { get; set; }
    public int SeasonId { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public int FormType { get; set; }

    public List<GameFormFieldModel> Fields { get; set; } = new();
}

public class GameFormFieldModel
{
    public int Id { get; set; }
    public string Question { get; set; } = "";
    public string Description { get; set; } = "";
    public int FieldType { get; set; }
    public bool Required { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsSystemField { get; set; }

    public List<GameFormFieldOptionModel> Options { get; set; } = new();
}

public class GameFormFieldOptionModel
{
    public int Id { get; set; }
    public string Value { get; set; } = "";
    public int DisplayOrder { get; set; }
}
