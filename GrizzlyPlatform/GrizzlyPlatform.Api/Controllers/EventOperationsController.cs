using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Models;
using GrizzlyPlatform.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrizzlyPlatform.Api.Controllers;

[ApiController]
[Route("api/EventOperations/{eventId:int}")]
public class EventOperationsController(GrizzlyDbContext db, EventSyncService sync) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(int eventId)
    {
        var eventItem = await db.Events.AsNoTracking().FirstOrDefaultAsync(e => e.Id == eventId);
        if (eventItem == null) return NotFound();
        var stored = await db.EventSyncStates.AsNoTracking().Where(s => s.EventId == eventId).ToListAsync();
        var states = EventSyncService.Resources.Select(r => stored.FirstOrDefault(s => s.Resource == r)
            ?? new EventSyncState { EventId = eventId, Resource = r }).ToList();
        var ids = db.EventTeams.Where(t => t.EventId == eventId).Select(t => t.TeamId)
            .Union(db.EventRankings.Where(r => r.EventId == eventId).Select(r => r.TeamId));
        var teams = await db.Teams.AsNoTracking().Where(t => ids.Contains(t.Id)).OrderBy(t => t.TeamNumber)
            .Select(t => new { t.Id, t.TeamNumber, t.Name }).ToListAsync();
        var matches = await db.Matches.AsNoTracking().Where(m => m.EventId == eventId)
            .OrderBy(m => m.MatchNumber).ThenBy(m => m.SetNumber).Select(m => new
            {
                m.Id, m.MatchType, m.MatchNumber, m.SetNumber, m.RedScore, m.BlueScore,
                teamNumbers = new[] { m.RedTeam1!.TeamNumber, m.RedTeam2!.TeamNumber, m.RedTeam3!.TeamNumber,
                    m.BlueTeam1!.TeamNumber, m.BlueTeam2!.TeamNumber, m.BlueTeam3!.TeamNumber }
            }).ToListAsync();
        var rankings = await db.EventRankings.AsNoTracking().Where(r => r.EventId == eventId)
            .OrderBy(r => r.Rank).Select(r => new { r.TeamId, r.Rank }).ToListAsync();
        return Ok(new { eventId, eventItem.Name, eventItem.BlueAllianceKey, states, teams, matches, rankings });
    }

    [HttpPost("sync/{resource}")]
    public async Task<IActionResult> Retry(int eventId, string resource)
    {
        if (!EventSyncService.Resources.Contains(resource)) return BadRequest("Unknown category.");
        if (!await db.Events.AnyAsync(e => e.Id == eventId)) return NotFound();
        return Ok(await sync.SyncAsync(eventId, resource));
    }

    [HttpPut("mode/{resource}")]
    public async Task<IActionResult> Mode(int eventId, string resource, SyncModeRequest request)
    {
        if (!EventSyncService.Resources.Contains(resource)) return BadRequest("Unknown category.");
        await using var transaction = await db.Database.BeginTransactionAsync();
        if (!await db.Events.AnyAsync(e => e.Id == eventId)) return NotFound();
        var state = await EventSyncService.State(db, eventId, resource);
        if (state.Revision != request.Revision) return Conflict("Data changed. Reload before changing sync mode.");
        state.ManualMode = request.ManualMode;
        state.Revision++;
        state.Outcome = request.ManualMode ? "Manual" : "Ready";
        state.Message = request.ManualMode ? "Automatic updates paused. Saved data is protected."
            : "Automatic updates resumed. The next successful sync may replace manual corrections.";
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Ok(state);
    }

    [HttpPost("teams")]
    public async Task<IActionResult> AddTeam(int eventId, ManualTeamRequest request)
    {
        if (request.TeamNumber <= 0 || string.IsNullOrWhiteSpace(request.Name) || request.Name.Length > 150)
            return BadRequest("Enter a positive team number and a name up to 150 characters.");
        await using var transaction = await db.Database.BeginTransactionAsync();
        if (!await db.Events.AnyAsync(e => e.Id == eventId)) return NotFound();
        var state = await EventSyncService.State(db, eventId, "teams");
        if (state.Revision != request.Revision) return Conflict("Roster changed. Reload before saving.");
        var team = await db.Teams.FirstOrDefaultAsync(t => t.TeamNumber == request.TeamNumber);
        if (team == null)
        {
            team = new Team { TeamNumber = request.TeamNumber, Name = request.Name.Trim() };
            db.Teams.Add(team);
        }
        else if (await db.EventTeams.AnyAsync(t => t.EventId == eventId && t.TeamId == team.Id))
            return Conflict("This team is already registered for the event.");
        db.EventTeams.Add(new EventTeam { EventId = eventId, Team = team });
        await EventSyncService.MarkManual(db, eventId, "teams");
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Ok(new { team.Id, team.TeamNumber, team.Name });
    }

    [HttpPut("rankings")]
    public async Task<IActionResult> SaveRankings(int eventId, ManualRankingsRequest request)
    {
        if (request.TeamIds == null || request.TeamIds.Count == 0 ||
            request.TeamIds.Distinct().Count() != request.TeamIds.Count) return BadRequest("Enter each event team exactly once.");
        await using var transaction = await db.Database.BeginTransactionAsync();
        if (!await db.Events.AnyAsync(e => e.Id == eventId)) return NotFound();
        var state = await EventSyncService.State(db, eventId, "rankings");
        if (state.Revision != request.Revision) return Conflict("Rankings changed. Reload before saving.");
        var existing = await db.EventRankings.Where(r => r.EventId == eventId).ToListAsync();
        var roster = await db.EventTeams.Where(t => t.EventId == eventId).Select(t => t.TeamId).ToListAsync();
        var expected = roster.Concat(existing.Select(r => r.TeamId)).ToHashSet();
        if (!expected.SetEquals(request.TeamIds)) return BadRequest("The order must include all registered/ranked event teams, with no other teams.");
        db.EventRankings.RemoveRange(existing);
        await db.SaveChangesAsync();
        db.EventRankings.AddRange(request.TeamIds.Select((id, i) => new EventRanking
        {
            EventId = eventId, TeamId = id, Rank = i + 1,
            RankingPoints = existing.FirstOrDefault(r => r.TeamId == id)?.RankingPoints ?? 0,
            TieBreaker1 = existing.FirstOrDefault(r => r.TeamId == id)?.TieBreaker1,
            TieBreaker2 = existing.FirstOrDefault(r => r.TeamId == id)?.TieBreaker2
        }));
        await EventSyncService.MarkManual(db, eventId, "rankings");
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Ok(new { message = "Manual ranking order saved. Existing alliance drafts retain their saved order." });
    }

    [HttpPut("matches")]
    public async Task<IActionResult> SaveMatch(int eventId, ManualMatchRequest request)
    {
        if (request.TeamNumbers == null || request.TeamNumbers.Length != 6)
            return BadRequest("Enter six team numbers.");
        var teams = await db.Teams.Where(t => request.TeamNumbers.Contains(t.TeamNumber)).ToListAsync();
        if (teams.Count != 6) return BadRequest("Enter six different known teams. Add missing teams first.");
        int Id(int position) => teams.Single(t => t.TeamNumber == request.TeamNumbers[position]).Id;
        var match = new Match { EventId = eventId, MatchType = request.MatchType,
            MatchNumber = request.MatchNumber, SetNumber = request.SetNumber, RedScore = request.RedScore, BlueScore = request.BlueScore,
            RedTeam1Id = Id(0), RedTeam2Id = Id(1), RedTeam3Id = Id(2), BlueTeam1Id = Id(3), BlueTeam2Id = Id(4), BlueTeam3Id = Id(5) };
        var controller = new MatchesController(db);
        var result = request.Id == 0 ? await controller.CreateMatch(match, request.Revision)
            : await controller.UpdateMatch(request.Id, match, request.Revision);
        return result is CreatedAtActionResult created ? Ok(created.Value) : result;
    }
}
public class SyncModeRequest { public long Revision { get; set; } public bool ManualMode { get; set; } }
public class ManualTeamRequest { public long Revision { get; set; } public int TeamNumber { get; set; } public string Name { get; set; } = ""; }
public class ManualRankingsRequest { public long Revision { get; set; } public List<int> TeamIds { get; set; } = new(); }
public class ManualMatchRequest
{
    public long Revision { get; set; }
    public int Id { get; set; }
    public string MatchType { get; set; } = "Qualification";
    public int MatchNumber { get; set; } = 1;
    public int SetNumber { get; set; }
    public int[] TeamNumbers { get; set; } = new int[6];
    public int? RedScore { get; set; }
    public int? BlueScore { get; set; }
}
