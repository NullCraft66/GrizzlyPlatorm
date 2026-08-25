namespace GrizzlyPlatform.Api.Dtos;

public class GameFormDto
{
    public int Id { get; set; }
    public int SeasonId { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public int FormType { get; set; }

    public List<GameFormFieldDto> Fields { get; set; } = new();
}

public class GameFormFieldDto
{
    public int Id { get; set; }
    public string Question { get; set; } = "";
    public string Description { get; set; } = "";
    public int FieldType { get; set; }
    public bool Required { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsSystemField { get; set; }

    public List<GameFormFieldOptionDto> Options { get; set; } = new();
}

public class GameFormFieldOptionDto
{
    public int Id { get; set; }
    public string Value { get; set; } = "";
    public int DisplayOrder { get; set; }
}