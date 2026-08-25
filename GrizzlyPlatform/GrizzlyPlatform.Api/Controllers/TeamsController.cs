using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrizzlyPlatform.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TeamsController : ControllerBase
{
    private readonly GrizzlyDbContext _context;

    public TeamsController(GrizzlyDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetTeams()
    {
        var teams = await _context.Teams.ToListAsync();

        return Ok(teams);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetTeam(int id)
    {
        var team = await _context.Teams.FindAsync(id);

        if (team == null)
        {
            return NotFound();
        }

        return Ok(team);
    }

    [HttpPost]
    public async Task<IActionResult> CreateTeam(Team team)
    {
        _context.Teams.Add(team);
        await _context.SaveChangesAsync();

        return CreatedAtAction(
            nameof(GetTeam),
            new { id = team.Id },
            team);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateTeam(int id, Team updatedTeam)
    {
        var team = await _context.Teams.FindAsync(id);

        if (team == null)
        {
            return NotFound();
        }

        team.TeamNumber = updatedTeam.TeamNumber;
        team.Name = updatedTeam.Name;
        team.Location = updatedTeam.Location;

        await _context.SaveChangesAsync();

        return Ok(team);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteTeam(int id)
    {
        var team = await _context.Teams.FindAsync(id);

        if (team == null)
        {
            return NotFound();
        }

        _context.Teams.Remove(team);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}