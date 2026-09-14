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
        eventItem.AllianceCount = updatedEvent.AllianceCount is >= 1 and <= 32 ? updatedEvent.AllianceCount : 8;
        eventItem.StartDate = updatedEvent.StartDate;
        eventItem.EndDate = updatedEvent.EndDate;

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
        if (!await _context.Events.AnyAsync(e => e.Id == id)) return NotFound();
        return Ok(await new EventSyncService(_context, _blueAllianceService).SyncAsync(id, "teams"));
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
        if (!await _context.Events.AnyAsync(e => e.Id == id)) return NotFound();
        return Ok(await new EventSyncService(_context, _blueAllianceService).SyncAsync(id, "matches"));
    }

    [HttpPost("{id}/sync-rankings")]
    public async Task<IActionResult> SyncRankings(int id)
    {
        if (!await _context.Events.AnyAsync(e => e.Id == id))
            return NotFound();

        return Ok(
            await new EventSyncService(
                _context,
                _blueAllianceService
            ).SyncAsync(id, "rankings"));
    }


}



