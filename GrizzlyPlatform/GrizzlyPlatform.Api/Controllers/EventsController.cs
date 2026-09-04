using System.Text.Json;
using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Models;
using GrizzlyPlatform.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrizzlyPlatform.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EventsController : ControllerBase
{
    private readonly GrizzlyDbContext _context;
    private readonly TheBlueAllianceService _blueAllianceService;

    public EventsController(
        GrizzlyDbContext context,
        TheBlueAllianceService blueAllianceService)
    {
        _context = context;
        _blueAllianceService = blueAllianceService;
    }

    [HttpGet]
    public async Task<IActionResult> GetEvents()
    {
        var events = await _context.Events
            .Include(e => e.Season)
            .OrderByDescending(e => e.Id)
            .ToListAsync();

        return Ok(events);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetEvent(int id)
    {
        var eventItem = await _context.Events
            .Include(e => e.Season)
            .FirstOrDefaultAsync(e => e.Id == id);

        if (eventItem == null)
        {
            return NotFound();
        }

        return Ok(eventItem);
    }

    [HttpPost]
    public async Task<IActionResult> CreateEvent(Event eventItem)
    {
        var seasonExists = await _context.Seasons
            .AnyAsync(s => s.Id == eventItem.SeasonId);

        if (!seasonExists)
        {
            return BadRequest("The selected season does not exist.");
        }

        _context.Events.Add(eventItem);
        await _context.SaveChangesAsync();

        await _context.Entry(eventItem)
            .Reference(e => e.Season)
            .LoadAsync();

        return CreatedAtAction(
            nameof(GetEvent),
            new { id = eventItem.Id },
            eventItem);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateEvent(
        int id,
        Event updatedEvent)
    {
        var eventItem = await _context.Events.FindAsync(id);

        if (eventItem == null)
        {
            return NotFound();
        }

        var seasonExists = await _context.Seasons
            .AnyAsync(s => s.Id == updatedEvent.SeasonId);

        if (!seasonExists)
        {
            return BadRequest("The selected season does not exist.");
        }

        eventItem.Name = updatedEvent.Name;
        eventItem.Location = updatedEvent.Location;
        eventItem.SeasonId = updatedEvent.SeasonId;
        eventItem.BlueAllianceKey = updatedEvent.BlueAllianceKey;
        eventItem.EventType = updatedEvent.EventType;

        await _context.SaveChangesAsync();

        await _context.Entry(eventItem)
            .Reference(e => e.Season)
            .LoadAsync();

        return Ok(eventItem);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteEvent(int id)
    {
        var eventItem = await _context.Events.FindAsync(id);

        if (eventItem == null)
        {
            return NotFound();
        }

        _context.Events.Remove(eventItem);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    [HttpGet("{id}/bluealliance/teams")]
    public async Task<IActionResult> GetBlueAllianceTeams(int id)
    {
        var eventItem = await _context.Events.FindAsync(id);

        if (eventItem == null)
        {
            return NotFound();
        }

        if (string.IsNullOrWhiteSpace(eventItem.BlueAllianceKey))
        {
            return BadRequest(
                "This event does not have a Blue Alliance key.");
        }

        var teams = await _blueAllianceService.GetEventTeamsAsync(
            eventItem.BlueAllianceKey);

        return Ok(teams);
    }

    [HttpPost("{id}/sync-teams")]
    public async Task<IActionResult> SyncTeams(int id)
    {
        var eventItem = await _context.Events
            .Include(e => e.EventTeams)
            .FirstOrDefaultAsync(e => e.Id == id);

        if (eventItem == null)
        {
            return NotFound();
        }

        if (string.IsNullOrWhiteSpace(eventItem.BlueAllianceKey))
        {
            return BadRequest(
                "This event does not have a Blue Alliance key.");
        }

        var blueAllianceTeams =
            await _blueAllianceService.GetEventTeamsAsync(
                eventItem.BlueAllianceKey);

        var imported = 0;
        var alreadyExists = 0;

        foreach (var teamJson in blueAllianceTeams.EnumerateArray())
        {
            var teamNumber =
                teamJson.GetProperty("team_number").GetInt32();

            var teamName =
                teamJson.GetProperty("nickname").GetString()
                ?? $"Team {teamNumber}";

            var city =
                teamJson.GetProperty("city").GetString() ?? "";

            var state =
                teamJson.GetProperty("state_prov").GetString() ?? "";

            var country =
                teamJson.GetProperty("country").GetString() ?? "";

            var location = string.Join(
                ", ",
                new[] { city, state, country }
                    .Where(x => !string.IsNullOrWhiteSpace(x)));

            var team = await _context.Teams
                .FirstOrDefaultAsync(
                    t => t.TeamNumber == teamNumber);

            if (team == null)
            {
                team = new Team
                {
                    TeamNumber = teamNumber,
                    Name = teamName,
                    Location = location
                };

                _context.Teams.Add(team);
                await _context.SaveChangesAsync();
            }

            var eventTeamExists = await _context.EventTeams
                .AnyAsync(et =>
                    et.EventId == id &&
                    et.TeamId == team.Id);

            if (eventTeamExists)
            {
                alreadyExists++;
            }
            else
            {
                _context.EventTeams.Add(new EventTeam
                {
                    EventId = id,
                    TeamId = team.Id
                });

                imported++;
            }
        }

        await _context.SaveChangesAsync();

        return Ok(new
        {
            eventId = id,
            imported,
            alreadyExists,
            total = imported + alreadyExists
        });
    }

    [HttpGet("{id}/bluealliance/matches")]
    public async Task<IActionResult> GetBlueAllianceMatches(int id)
    {
        var eventItem = await _context.Events.FindAsync(id);

        if (eventItem == null)
        {
            return NotFound();
        }

        if (string.IsNullOrWhiteSpace(eventItem.BlueAllianceKey))
        {
            return BadRequest(
                "This event does not have a Blue Alliance key.");
        }

        var matches = await _blueAllianceService.GetEventMatchesAsync(
            eventItem.BlueAllianceKey);

        return Ok(matches);
    }

    [HttpPost("{id}/sync-matches")]
    public async Task<IActionResult> SyncMatches(int id)
    {
        var eventItem = await _context.Events
            .Include(e => e.EventTeams)
            .FirstOrDefaultAsync(e => e.Id == id);

        if (eventItem == null)
        {
            return NotFound();
        }

        if (string.IsNullOrWhiteSpace(eventItem.BlueAllianceKey))
        {
            return BadRequest(
                "This event does not have a Blue Alliance key.");
        }

        var blueAllianceMatches =
            await _blueAllianceService.GetEventMatchesAsync(
                eventItem.BlueAllianceKey);

        var imported = 0;
        var alreadyExists = 0;
        var skipped = 0;

        foreach (var matchJson in blueAllianceMatches.EnumerateArray())
        {
            var compLevel =
                matchJson.GetProperty("comp_level").GetString()
                ?? "qm";

            var matchNumber =
                matchJson.GetProperty("match_number").GetInt32();

            var setNumber =
                matchJson.GetProperty("set_number").GetInt32();

            var matchType = compLevel switch
            {
                "qm" => "Qualification",
                "ef" => "EighthFinal",
                "qf" => "Quarterfinal",
                "sf" => "Semifinal",
                "f" => "Final",
                _ => compLevel
            };

            var alliances =
                matchJson.GetProperty("alliances");

            var red =
                alliances.GetProperty("red");

            var blue =
                alliances.GetProperty("blue");

            var redScore =
                red.GetProperty("score").GetInt32();

            var blueScore =
                blue.GetProperty("score").GetInt32();

            var winningAlliance =
                matchJson.TryGetProperty(
                    "winning_alliance",
                    out var winner)
                    ? winner.GetString()
                    : null;

            var existingMatch = await _context.Matches
                .FirstOrDefaultAsync(m =>
                    m.EventId == id &&
                    m.MatchType == matchType &&
                    m.MatchNumber == matchNumber &&
                    m.SetNumber == setNumber);

            if (existingMatch != null)
            {
                existingMatch.RedScore = redScore;
                existingMatch.BlueScore = blueScore;
                existingMatch.WinningAlliance = winningAlliance;

                alreadyExists++;
                continue;
            }

            var redTeams = red
                .GetProperty("team_keys")
                .EnumerateArray()
                .Select(x => x.GetString())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .ToList();

            var blueTeams = blue
                .GetProperty("team_keys")
                .EnumerateArray()
                .Select(x => x.GetString())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .ToList();

            if (redTeams.Count < 3 || blueTeams.Count < 3)
            {
                skipped++;
                continue;
            }

            var redTeam1Number =
                ParseTeamNumber(redTeams[0]!);

            var redTeam2Number =
                ParseTeamNumber(redTeams[1]!);

            var redTeam3Number =
                ParseTeamNumber(redTeams[2]!);

            var blueTeam1Number =
                ParseTeamNumber(blueTeams[0]!);

            var blueTeam2Number =
                ParseTeamNumber(blueTeams[1]!);

            var blueTeam3Number =
                ParseTeamNumber(blueTeams[2]!);

            var redTeam1 = await _context.Teams
                .FirstOrDefaultAsync(
                    t => t.TeamNumber == redTeam1Number);

            var redTeam2 = await _context.Teams
                .FirstOrDefaultAsync(
                    t => t.TeamNumber == redTeam2Number);

            var redTeam3 = await _context.Teams
                .FirstOrDefaultAsync(
                    t => t.TeamNumber == redTeam3Number);

            var blueTeam1 = await _context.Teams
                .FirstOrDefaultAsync(
                    t => t.TeamNumber == blueTeam1Number);

            var blueTeam2 = await _context.Teams
                .FirstOrDefaultAsync(
                    t => t.TeamNumber == blueTeam2Number);

            var blueTeam3 = await _context.Teams
                .FirstOrDefaultAsync(
                    t => t.TeamNumber == blueTeam3Number);

            if (redTeam1 == null ||
                redTeam2 == null ||
                redTeam3 == null ||
                blueTeam1 == null ||
                blueTeam2 == null ||
                blueTeam3 == null)
            {
                skipped++;
                continue;
            }

            var match = new Match
            {
                EventId = id,

                MatchType = matchType,
                MatchNumber = matchNumber,
                SetNumber = setNumber,

                RedTeam1Id = redTeam1.Id,
                RedTeam2Id = redTeam2.Id,
                RedTeam3Id = redTeam3.Id,

                BlueTeam1Id = blueTeam1.Id,
                BlueTeam2Id = blueTeam2.Id,
                BlueTeam3Id = blueTeam3.Id,

                RedScore = redScore,
                BlueScore = blueScore,
                WinningAlliance = winningAlliance
            };

            _context.Matches.Add(match);
            imported++;
        }

        await _context.SaveChangesAsync();

        return Ok(new
        {
            eventId = id,
            imported,
            alreadyExists,
            skipped,
            total = imported + alreadyExists + skipped
        });
    }

    private static int ParseTeamNumber(string teamKey)
    {
        return int.Parse(
            teamKey.Replace("frc", ""));
    }
}