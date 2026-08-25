
using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrizzlyPlatform.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SeasonsController : ControllerBase
{
    private readonly GrizzlyDbContext _context;

    public SeasonsController(GrizzlyDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetSeasons()
    {
        var seasons = await _context.Seasons
            .OrderByDescending(s => s.Year)
            .ToListAsync();

        return Ok(seasons);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetSeason(int id)
    {
        var season = await _context.Seasons.FindAsync(id);

        if (season == null)
        {
            return NotFound();
        }

        return Ok(season);
    }

    [HttpPost]
    public async Task<IActionResult> CreateSeason(Season season)
    {
        _context.Seasons.Add(season);
        await _context.SaveChangesAsync();

        return CreatedAtAction(
            nameof(GetSeason),
            new { id = season.Id },
            season);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteSeason(int id)
    {
        var season = await _context.Seasons.FindAsync(id);

        if (season == null)
        {
            return NotFound();
        }

        _context.Seasons.Remove(season);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}

