using GrizzlyPlatform.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace GrizzlyPlatform.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AuthService _authService;

    public AuthController(AuthService authService)
    {
        _authService = authService;
    }

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers()
    {
        var users = await _authService.GetUsersAsync();

        return Ok(users.Select(u => new
        {
            u.Id,
            u.Username,
            u.DisplayName,
            u.Role,
            u.IsActive
        }));
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(
        [FromBody] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) ||
            string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new
            {
                message = "Username and password are required."
            });
        }

        var user = await _authService
            .FindByUsernameAsync(request.Username);

        if (user == null ||
            !user.IsActive ||
            !_authService.VerifyPassword(
                user,
                request.Password))
        {
            return Unauthorized(new
            {
                message = "Invalid username or password."
            });
        }

        return Ok(new
        {
            id = user.Id,
            username = user.Username,
            displayName = user.DisplayName,
            role = user.Role
        });
    }
}

public class LoginRequest
{
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
}

