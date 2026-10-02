using GrizzlyPlatform.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrizzlyPlatform.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AuthService _authService;
    private readonly IConfiguration _configuration;

    public AuthController(AuthService authService, IConfiguration configuration)
    {
        _authService = authService;
        _configuration = configuration;
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
            u.IsActive,
            u.AllowedPages
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
            role = user.Role,
            allowedPages = user.AllowedPages
        });
    }

    [HttpPost("users")]
    public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) ||
            string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new { message = "Username and password are required." });

        if (request.Role.Equals("UltimateAdmin", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(request.UltimateAdminPassword, _configuration["UltimateAdminCreationPassword"], StringComparison.Ordinal))
            return Unauthorized(new { message = "The Ultimate Admin creation password is required." });

        if (await _authService.FindByUsernameAsync(request.Username) != null)
            return Conflict(new { message = "That username already exists." });

        var user = await _authService.CreateUserAsync(
            request.Username.Trim(),
            string.IsNullOrWhiteSpace(request.DisplayName) ? request.Username.Trim() : request.DisplayName.Trim(),
            request.Password,
            string.IsNullOrWhiteSpace(request.Role) ? "Scout" : request.Role.Trim());
        user.AllowedPages = request.AllowedPages ?? "*";
        await _authService.SaveAsync();

        return Ok(new { user.Id, user.Username, user.DisplayName, user.Role, user.IsActive });
    }

    [HttpPut("users/{id}/permissions")]
    public async Task<IActionResult> UpdatePermissions(int id, [FromBody] PermissionsRequest request)
    {
        var user = (await _authService.GetUsersAsync()).FirstOrDefault(u => u.Id == id);
        if (user == null) return NotFound();
        user.AllowedPages = request.AllowedPages ?? "";
        await _authService.SaveAsync();
        return Ok(new { user.Id, user.AllowedPages });
    }

    [HttpGet("seed")]
    public async Task<IActionResult> ExportSeed()
    {
        var users = await _authService.GetUsersAsync();
        return Ok(new
        {
            accounts = users.Select(u => new
            {
                username = u.Username,
                displayName = u.DisplayName,
                password = "",
                role = u.Role,
                updateExisting = true
            })
        });
    }

    [HttpPost("seed")]
    public async Task<IActionResult> ImportSeed([FromBody] AccountSeed seed)
    {
        var imported = 0;
        foreach (var account in seed.Accounts)
        {
            if (string.IsNullOrWhiteSpace(account.Username) || string.IsNullOrWhiteSpace(account.Password))
                continue;

            var existing = await _authService.FindByUsernameAsync(account.Username);
            if (existing == null)
            {
                await _authService.CreateUserAsync(account.Username.Trim(), account.DisplayName?.Trim() ?? account.Username.Trim(), account.Password, account.Role ?? "Scout");
            }
            else if (account.UpdateExisting)
            {
                existing.DisplayName = account.DisplayName?.Trim() ?? existing.DisplayName;
                existing.Role = account.Role ?? existing.Role;
                existing.IsActive = true;
                await _authService.SetPasswordAsync(existing, account.Password);
            }
            imported++;
        }
        return Ok(new { imported });
    }
}

public class LoginRequest
{
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
}

public class CreateUserRequest
{
    public string Username { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string Password { get; set; } = "";
    public string Role { get; set; } = "Scout";
    public string UltimateAdminPassword { get; set; } = "";
    public string AllowedPages { get; set; } = "*";
}

public class PermissionsRequest { public string AllowedPages { get; set; } = ""; }

