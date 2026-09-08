using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrizzlyPlatform.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class MatchesController : ControllerBase
{
    private readonly GrizzlyDbContext _context;

    public MatchesController(GrizzlyDbContext context)
    {
        _context = context;
    }

    private static int MatchTypeSortOrder(string? matchType) => matchType switch
    {
        "Qualification" => 1,
        "EighthFinal"   => 2,
        "Quarterfinal"  => 3,
        "Semifinal"     => 4,
        "Final"         => 5,
        _               => 6
    };

    [HttpGet]
    public async Task<IActionResult> GetMatches()
    {
        var matches = await _context.Matches
            .Select(m => new
            {
                m.Id,
                m.EventId,
                m.MatchType,
                m.MatchNumber,
                m.SetNumber,
                m.RedScore,
                m.BlueScore,
                m.WinningAlliance,

                redTeam1 = new { m.RedTeam1!.Id, m.RedTeam1.TeamNumber, m.RedTeam1.Name },
                redTeam2 = new { m.RedTeam2!.Id, m.RedTeam2.TeamNumber, m.RedTeam2.Name },
                redTeam3 = new { m.RedTeam3!.Id, m.RedTeam3.TeamNumber, m.RedTeam3.Name },
                blueTeam1 = new { m.BlueTeam1!.Id, m.BlueTeam1.TeamNumber, m.BlueTeam1.Name },
                blueTeam2 = new { m.BlueTeam2!.Id, m.BlueTeam2.TeamNumber, m.BlueTeam2.Name },
                blueTeam3 = new { m.BlueTeam3!.Id, m.BlueTeam3.TeamNumber, m.BlueTeam3.Name }
            })
            .ToListAsync();

        return Ok(matches
            .OrderBy(m => MatchTypeSortOrder(m.MatchType))
            .ThenBy(m => m.MatchNumber)
            .ThenBy(m => m.SetNumber));
    }

    [HttpGet("event/{eventId}")]
    public async Task<IActionResult> GetMatchesForEvent(int eventId)
    {
        var matches = await _context.Matches
            .Where(m => m.EventId == eventId)
            .Select(m => new
            {
                m.Id,
                m.EventId,
                m.MatchType,
                m.MatchNumber,
                m.SetNumber,
                m.RedScore,
                m.BlueScore,
                m.WinningAlliance,

                redTeam1 = new { m.RedTeam1!.Id, m.RedTeam1.TeamNumber, m.RedTeam1.Name },
                redTeam2 = new { m.RedTeam2!.Id, m.RedTeam2.TeamNumber, m.RedTeam2.Name },
                redTeam3 = new { m.RedTeam3!.Id, m.RedTeam3.TeamNumber, m.RedTeam3.Name },
                blueTeam1 = new { m.BlueTeam1!.Id, m.BlueTeam1.TeamNumber, m.BlueTeam1.Name },
                blueTeam2 = new { m.BlueTeam2!.Id, m.BlueTeam2.TeamNumber, m.BlueTeam2.Name },
                blueTeam3 = new { m.BlueTeam3!.Id, m.BlueTeam3.TeamNumber, m.BlueTeam3.Name }
            })
            .ToListAsync();

        return Ok(matches
            .OrderBy(m => MatchTypeSortOrder(m.MatchType))
            .ThenBy(m => m.MatchNumber)
            .ThenBy(m => m.SetNumber));
    }

    [HttpGet("team/{teamId}")]
    public async Task<IActionResult> GetMatchesForTeam(int teamId)
    {
        var matches = await _context.Matches
            .Where(m =>
                m.RedTeam1Id == teamId ||
                m.RedTeam2Id == teamId ||
                m.RedTeam3Id == teamId ||
                m.BlueTeam1Id == teamId ||
                m.BlueTeam2Id == teamId ||
                m.BlueTeam3Id == teamId)
            .Select(m => new
            {
                m.Id,
                m.EventId,
                m.MatchType,
                m.MatchNumber,
                m.SetNumber,
                m.RedScore,
                m.BlueScore,
                m.WinningAlliance,

                redTeam1 = new { m.RedTeam1!.Id, m.RedTeam1.TeamNumber, m.RedTeam1.Name },
                redTeam2 = new { m.RedTeam2!.Id, m.RedTeam2.TeamNumber, m.RedTeam2.Name },
                redTeam3 = new { m.RedTeam3!.Id, m.RedTeam3.TeamNumber, m.RedTeam3.Name },
                blueTeam1 = new { m.BlueTeam1!.Id, m.BlueTeam1.TeamNumber, m.BlueTeam1.Name },
                blueTeam2 = new { m.BlueTeam2!.Id, m.BlueTeam2.TeamNumber, m.BlueTeam2.Name },
                blueTeam3 = new { m.BlueTeam3!.Id, m.BlueTeam3.TeamNumber, m.BlueTeam3.Name }
            })
            .ToListAsync();

        return Ok(matches
            .OrderBy(m => MatchTypeSortOrder(m.MatchType))
            .ThenBy(m => m.MatchNumber)
            .ThenBy(m => m.SetNumber));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetMatch(int id)
    {
        var match = await _context.Matches
            .Where(m => m.Id == id)
            .Select(m => new
            {
                m.Id,
                m.EventId,
                m.MatchType,
                m.MatchNumber,
                m.SetNumber,
                m.RedScore,
                m.BlueScore,
                m.WinningAlliance,

                redTeam1 = new { m.RedTeam1!.Id, m.RedTeam1.TeamNumber, m.RedTeam1.Name },
                redTeam2 = new { m.RedTeam2!.Id, m.RedTeam2.TeamNumber, m.RedTeam2.Name },
                redTeam3 = new { m.RedTeam3!.Id, m.RedTeam3.TeamNumber, m.RedTeam3.Name },
                blueTeam1 = new { m.BlueTeam1!.Id, m.BlueTeam1.TeamNumber, m.BlueTeam1.Name },
                blueTeam2 = new { m.BlueTeam2!.Id, m.BlueTeam2.TeamNumber, m.BlueTeam2.Name },
                blueTeam3 = new { m.BlueTeam3!.Id, m.BlueTeam3.TeamNumber, m.BlueTeam3.Name }
            })
            .FirstOrDefaultAsync();

        if (match == null)
        {
            return NotFound();
        }

        return Ok(match);
    }

    [HttpPost]
    public async Task<IActionResult> CreateMatch(Match match)
    {
        _context.Matches.Add(match);
        await _context.SaveChangesAsync();

        return CreatedAtAction(
            nameof(GetMatch),
            new { id = match.Id },
            match);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateMatch(int id, Match updatedMatch)
    {
        var match = await _context.Matches.FindAsync(id);

        if (match == null)
        {
            return NotFound();
        }

        match.EventId = updatedMatch.EventId;
        match.MatchType = updatedMatch.MatchType;
        match.MatchNumber = updatedMatch.MatchNumber;
        match.SetNumber = updatedMatch.SetNumber;

        match.RedTeam1Id = updatedMatch.RedTeam1Id;
        match.RedTeam2Id = updatedMatch.RedTeam2Id;
        match.RedTeam3Id = updatedMatch.RedTeam3Id;

        match.BlueTeam1Id = updatedMatch.BlueTeam1Id;
        match.BlueTeam2Id = updatedMatch.BlueTeam2Id;
        match.BlueTeam3Id = updatedMatch.BlueTeam3Id;

        match.RedScore = updatedMatch.RedScore;
        match.BlueScore = updatedMatch.BlueScore;
        match.WinningAlliance = updatedMatch.WinningAlliance;

        await _context.SaveChangesAsync();

        return Ok(match);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteMatch(int id)
    {
        var match = await _context.Matches.FindAsync(id);

        if (match == null)
        {
            return NotFound();
        }

        _context.Matches.Remove(match);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}
