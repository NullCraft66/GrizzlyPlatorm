namespace GrizzlyPlatform.Api.Models;

public class GameForm
{
    public int Id { get; set; }

    public int SeasonId { get; set; }

    public string Name { get; set; } = "";

    public string Description { get; set; } = "";

    public GameFormType FormType { get; set; }

    public Season? Season { get; set; }

    public ICollection<GameFormField> Fields { get; set; }
        = new List<GameFormField>();
}