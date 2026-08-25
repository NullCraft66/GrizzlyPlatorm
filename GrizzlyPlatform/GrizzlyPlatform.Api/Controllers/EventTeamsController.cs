using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrizzlyPlatform.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EventTeamsController : ControllerBase
{
    private readonly GrizzlyDbContext _context;

    public EventTeamsController(GrizzlyDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetEventTeams()
    {
        var eventTeams = await _context.EventTeams
            .Select(et => new
            {
                id = et.Id,
                eventId = et.EventId,
                teamId = et.TeamId,

                eventInfo = new
{
    id = et.Event.Id,
    name = et.Event.Name,
    location = et.Event.Location,

    season = et.Event.Season == null
        ? null
        : new
        {
            id = et.Event.Season.Id,
            year = et.Event.Season.Year,
            name = et.Event.Season.Name
        }
},
                team = new
                {
                    id = et.Team.Id,
                    teamNumber = et.Team.TeamNumber,
                    name = et.Team.Name,
                    location = et.Team.Location
                }
            })
            .ToListAsync();

        return Ok(eventTeams);
    }

    [HttpGet("event/{eventId}")]
    public async Task<IActionResult> GetTeamsForEvent(int eventId)
    {
        var eventTeams = await _context.EventTeams
            .Where(et => et.EventId == eventId)
            .Select(et => new
            {
                id = et.Id,
                eventId = et.EventId,
                teamId = et.TeamId,

                team = new
                {
                    id = et.Team.Id,
                    teamNumber = et.Team.TeamNumber,
                    name = et.Team.Name,
                    location = et.Team.Location
                }
            })
            .ToListAsync();

        return Ok(eventTeams);
    }

    [HttpPost]
    public async Task<IActionResult> AddTeamToEvent(EventTeam eventTeam)
    {
        var existing = await _context.EventTeams
            .FirstOrDefaultAsync(et =>
                et.EventId == eventTeam.EventId &&
                et.TeamId == eventTeam.TeamId);

        if (existing != null)
        {
            return Conflict(
                "This team is already assigned to this event.");
        }

        _context.EventTeams.Add(eventTeam);
        await _context.SaveChangesAsync();

        return Ok(new
        {
            id = eventTeam.Id,
            eventId = eventTeam.EventId,
            teamId = eventTeam.TeamId
        });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> RemoveTeamFromEvent(int id)
    {
        var eventTeam = await _context.EventTeams.FindAsync(id);

        if (eventTeam == null)
        {
            return NotFound();
        }

        _context.EventTeams.Remove(eventTeam);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}