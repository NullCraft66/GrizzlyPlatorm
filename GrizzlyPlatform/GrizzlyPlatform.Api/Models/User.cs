using System.ComponentModel.DataAnnotations;

namespace GrizzlyPlatform.Api.Models;

public class User
{
    public int Id { get; set; }

    [Required]
    public string Username { get; set; } = "";

    [Required]
    public string DisplayName { get; set; } = "";

    [Required]
    public string PasswordHash { get; set; } = "";

    [Required]
    public string Role { get; set; } = "Scout";

    public bool IsActive { get; set; } = true;
}
