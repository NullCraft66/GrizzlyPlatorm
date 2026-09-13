using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Models;
using GrizzlyPlatform.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace GrizzlyPlatform.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EventRankingsController : ControllerBase
{
    private readonly GrizzlyDbContext _context;
    private readonly TheBlueAllianceService _blueAllianceService;

    public EventRankingsController(
        GrizzlyDbContext context,
        TheBlueAllianceService blueAllianceService)
    {
        _context = context;
        _blueAllianceService = blueAllianceService;
    }

    [HttpGet("event/{eventId}")]
    public async Task<IActionResult> GetRankings(int eventId)
    {
        var rankings = await _context.EventRankings
            .Where(r => r.EventId == eventId)
            .Include(r => r.Team)
            .OrderBy(r => r.Rank)
            .Select(r => new
            {
                r.Id,
                r.EventId,
                r.TeamId,
                teamNumber = r.Team!.TeamNumber,
                teamName = r.Team.Name,
                r.Rank,
                r.RankingPoints,
                r.TieBreaker1,
                r.TieBreaker2
            })
            .ToListAsync();

        if (rankings.Count == 0) {
            var roster = await _context.EventTeams.Where(t => t.EventId == eventId).Include(t => t.Team).OrderBy(t => t.Team!.TeamNumber).ToListAsync();
            return Ok(roster.Select((t, i) => new { Id = 0, t.EventId, t.TeamId, teamNumber = t.Team!.TeamNumber, teamName = t.Team.Name, Rank = i + 1, RankingPoints = 0, TieBreaker1 = (double?)null, TieBreaker2 = (double?)null }));
        }

        return Ok(rankings);
    }

    [HttpPost("sync/{eventId}")]
    public async Task<IActionResult> SyncRankings(int eventId)
    {
        if (!await _context.Events.AnyAsync(e => e.Id == eventId)) return NotFound();
        return Ok(await new EventSyncService(_context, _blueAllianceService).SyncAsync(eventId, "rankings"));
    }
}
