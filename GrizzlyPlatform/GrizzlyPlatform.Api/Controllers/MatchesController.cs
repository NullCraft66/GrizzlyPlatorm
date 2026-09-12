using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Services;
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
    public async Task<IActionResult> CreateMatch(Match input, [FromQuery] long? revision = null)
    {
        await using var transaction = await _context.Database.BeginTransactionAsync();
        var error = await Validate(input);
        if (error != null) return BadRequest(error);
        var state = await EventSyncService.State(_context, input.EventId, "matches");
        if (revision.HasValue && revision != state.Revision) return Conflict("Schedule changed. Reload before saving.");
        if (await _context.Matches.AnyAsync(m => m.EventId == input.EventId && m.MatchType == input.MatchType &&
            m.MatchNumber == input.MatchNumber && m.SetNumber == input.SetNumber))
            return Conflict("This match already exists. Edit it instead.");
        var match = new Match();
        Copy(input, match);
        _context.Matches.Add(match);
        await EventSyncService.MarkManual(_context, match.EventId, "matches");
        await _context.SaveChangesAsync();
        await transaction.CommitAsync();
        return CreatedAtAction(nameof(GetMatch), new { id = match.Id }, new { match.Id });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateMatch(int id, Match input, [FromQuery] long? revision = null)
    {
        await using var transaction = await _context.Database.BeginTransactionAsync();
        var match = await _context.Matches.FindAsync(id);
        if (match == null) return NotFound();
        if (input.EventId != match.EventId) return BadRequest("A match cannot be moved to another event.");
        var error = await Validate(input);
        if (error != null) return BadRequest(error);
        var state = await EventSyncService.State(_context, match.EventId, "matches");
        if (revision.HasValue && revision != state.Revision) return Conflict("Schedule changed. Reload before saving.");
        if (await _context.Matches.AnyAsync(m => m.Id != id && m.EventId == input.EventId && m.MatchType == input.MatchType &&
            m.MatchNumber == input.MatchNumber && m.SetNumber == input.SetNumber))
            return Conflict("That match number/type/set already exists.");
        if (await _context.GameFormSubmissions.AnyAsync(s => s.MatchId == id) &&
            (match.MatchType != input.MatchType || match.MatchNumber != input.MatchNumber ||
             match.SetNumber != input.SetNumber || !Teams(match).SequenceEqual(Teams(input))))
            return BadRequest("This match has scouting submissions. Only its scores can be edited.");
        Copy(input, match);
        await EventSyncService.MarkManual(_context, match.EventId, "matches");
        await _context.SaveChangesAsync();
        await transaction.CommitAsync();
        return Ok(new { match.Id });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteMatch(int id)
    {
        await using var transaction = await _context.Database.BeginTransactionAsync();
        var match = await _context.Matches.FindAsync(id);
        if (match == null) return NotFound();
        if (await _context.GameFormSubmissions.AnyAsync(s => s.MatchId == id))
            return BadRequest("A match with scouting submissions cannot be deleted.");
        _context.Matches.Remove(match);
        await EventSyncService.MarkManual(_context, match.EventId, "matches");
        await _context.SaveChangesAsync();
        await transaction.CommitAsync();
        return NoContent();
    }

    private static int[] Teams(Match m) =>
        [m.RedTeam1Id, m.RedTeam2Id, m.RedTeam3Id, m.BlueTeam1Id, m.BlueTeam2Id, m.BlueTeam3Id];
    private async Task<string?> Validate(Match m)
    {
        if (!await _context.Events.AnyAsync(e => e.Id == m.EventId)) return "Event not found.";
        if (!new[] { "Qualification", "EighthFinal", "Quarterfinal", "Semifinal", "Final" }.Contains(m.MatchType) ||
            m.MatchNumber <= 0 || m.SetNumber < 0) return "Enter a valid match type, number, and set.";
        var teams = Teams(m);
        var roster = await _context.EventTeams.Where(t => t.EventId == m.EventId).Select(t => t.TeamId)
            .Union(_context.EventRankings.Where(r => r.EventId == m.EventId).Select(r => r.TeamId)).ToListAsync();
        if (teams.Distinct().Count() != 6 || teams.Any(id => !roster.Contains(id)))
            return "Choose six different teams registered or ranked at this event.";
        if (m.RedScore < 0 || m.BlueScore < 0 || m.RedScore.HasValue != m.BlueScore.HasValue)
            return "Leave both scores blank for an unplayed match, or enter two nonnegative scores.";
        return null;
    }
    private static void Copy(Match source, Match target)
    {
        target.EventId = source.EventId; target.MatchType = source.MatchType;
        target.MatchNumber = source.MatchNumber; target.SetNumber = source.SetNumber;
        target.RedTeam1Id = source.RedTeam1Id; target.RedTeam2Id = source.RedTeam2Id; target.RedTeam3Id = source.RedTeam3Id;
        target.BlueTeam1Id = source.BlueTeam1Id; target.BlueTeam2Id = source.BlueTeam2Id; target.BlueTeam3Id = source.BlueTeam3Id;
        target.RedScore = source.RedScore; target.BlueScore = source.BlueScore;
        target.WinningAlliance = source.RedScore == null || source.RedScore == source.BlueScore ? "" : source.RedScore > source.BlueScore ? "red" : "blue";
    }
}
