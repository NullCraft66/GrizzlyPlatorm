using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace GrizzlyPlatform.Api.Models;

public class Season
{
    public int Id { get; set; }

    [Required]
    public int Year { get; set; }

    [Required]
    public string Name { get; set; } = string.Empty;

    [JsonIgnore]
    public ICollection<GameForm> GameForms { get; set; } = new List<GameForm>();
}
