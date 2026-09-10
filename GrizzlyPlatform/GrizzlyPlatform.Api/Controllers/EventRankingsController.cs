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

        return Ok(rankings);
    }

    [HttpPost("sync/{eventId}")]
    public async Task<IActionResult> SyncRankings(int eventId)
    {
        var eventItem = await _context.Events
            .FirstOrDefaultAsync(e => e.Id == eventId);

        if (eventItem == null)
        {
            return NotFound("Event not found.");
        }

        if (string.IsNullOrWhiteSpace(eventItem.BlueAllianceKey))
        {
            return BadRequest(
                "This event does not have a The Blue Alliance key.");
        }

        var rankingsJson =
            await _blueAllianceService.GetEventRankingsAsync(
                eventItem.BlueAllianceKey);

    if (rankingsJson.ValueKind != JsonValueKind.Object ||
    !rankingsJson.TryGetProperty(
        "rankings",
        out var rankingsArray) ||
    rankingsArray.ValueKind != JsonValueKind.Array)
{
    return BadRequest(
        "The Blue Alliance returned an unexpected rankings response.");
}

        var existingRankings = await _context.EventRankings
            .Where(r => r.EventId == eventId)
            .ToListAsync();

        _context.EventRankings.RemoveRange(existingRankings);

        var imported = 0;
        var skipped = 0;

       foreach (var rankingJson in rankingsArray.EnumerateArray())
        {
            if (!rankingJson.TryGetProperty(
                    "rank",
                    out var rankElement))
            {
                skipped++;
                continue;
            }

            if (!rankingJson.TryGetProperty(
                    "team_key",
                    out var teamKeyElement))
            {
                skipped++;
                continue;
            }

            var rank = rankElement.GetInt32();

            var teamKey = teamKeyElement.GetString();

            if (string.IsNullOrWhiteSpace(teamKey))
            {
                skipped++;
                continue;
            }

            if (!int.TryParse(
                    teamKey.Replace("frc", ""),
                    out var teamNumber))
            {
                skipped++;
                continue;
            }

            var team = await _context.Teams
                .FirstOrDefaultAsync(
                    t => t.TeamNumber == teamNumber);

            if (team == null)
            {
                skipped++;
                continue;
            }
var rankingPoints = 0;

if (rankingJson.TryGetProperty(
        "extra_stats",
        out var extraStats) &&
    extraStats.ValueKind == JsonValueKind.Array &&
    extraStats.GetArrayLength() > 0)
{
    rankingPoints =
        extraStats[0].GetInt32();
}
            double? tieBreaker1 = null;
            double? tieBreaker2 = null;

if (rankingJson.TryGetProperty(
        "sort_orders",
        out var sortOrders) &&
    sortOrders.ValueKind == JsonValueKind.Array)
{
    if (sortOrders.GetArrayLength() > 1)
    {
        tieBreaker1 =
            sortOrders[1].GetDouble();
    }

    if (sortOrders.GetArrayLength() > 2)
    {
        tieBreaker2 =
            sortOrders[2].GetDouble();
    }
}
            _context.EventRankings.Add(
                new EventRanking
                {
                    EventId = eventId,
                    TeamId = team.Id,
                    Rank = rank,
                    RankingPoints = rankingPoints,
                    TieBreaker1 = tieBreaker1,
                    TieBreaker2 = tieBreaker2
                });

            imported++;
        }

        await _context.SaveChangesAsync();

        return Ok(new
        {
            eventId,
            imported,
            skipped
        });
    }
}

