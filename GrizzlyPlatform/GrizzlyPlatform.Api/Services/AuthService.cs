using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace GrizzlyPlatform.Api.Services;

public class AuthService
{
    private readonly GrizzlyDbContext _context;
    private readonly PasswordHasher<User> _passwordHasher;

    public AuthService(GrizzlyDbContext context)
    {
        _context = context;
        _passwordHasher = new PasswordHasher<User>();
    }

    public async Task<User?> FindByUsernameAsync(string username)
    {
        return await _context.Users
            .FirstOrDefaultAsync(u => u.Username == username);
    }

    public async Task<User> CreateUserAsync(
        string username,
        string displayName,
        string password,
        string role = "Scout")
    {
        var user = new User
        {
            Username = username,
            DisplayName = displayName,
            Role = role,
            IsActive = true
        };

        user.PasswordHash =
            _passwordHasher.HashPassword(user, password);

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        return user;
    }

    public async Task<List<User>> GetUsersAsync()
    {
        return await _context.Users
            .ToListAsync();
    }

    public bool VerifyPassword(
        User user,
        string password)
    {
        var result = _passwordHasher.VerifyHashedPassword(
            user,
            user.PasswordHash,
            password);

        return result == PasswordVerificationResult.Success ||
               result == PasswordVerificationResult.SuccessRehashNeeded;
    }
}

