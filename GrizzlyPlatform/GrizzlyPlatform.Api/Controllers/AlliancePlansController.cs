using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrizzlyPlatform.Api.Controllers;

[ApiController]
[Route("api/AlliancePlans/event/{eventId:int}")]
public class AlliancePlansController(GrizzlyDbContext db) : ControllerBase
{
    private IQueryable<int> EventTeamIds(int eventId) =>
        db.EventTeams.Where(t => t.EventId == eventId).Select(t => t.TeamId)
            .Union(db.EventRankings.Where(t => t.EventId == eventId).Select(t => t.TeamId));

    [HttpGet]
    public async Task<IActionResult> Get(int eventId)
    {
        var eventItem = await db.Events.AsNoTracking().FirstOrDefaultAsync(e => e.Id == eventId);
        if (eventItem == null) return NotFound("Event not found.");
        var plan = await db.AlliancePlans.AsNoTracking().Include(p => p.Wishlist)
            .FirstOrDefaultAsync(p => p.EventId == eventId);
        var suggestions = await db.AlliancePlanSuggestions.AsNoTracking()
            .Where(s => s.EventId == eventId).OrderByDescending(s => s.CreatedAt).ToListAsync();
        var teams = await db.Teams.AsNoTracking().Where(t => EventTeamIds(eventId).Contains(t.Id))
            .OrderBy(t => t.TeamNumber).Select(t => new { teamId = t.Id, t.TeamNumber, teamName = t.Name }).ToListAsync();
        return Ok(new
        {
            eventId, eventName = eventItem.Name, seasonId = eventItem.SeasonId,
            version = plan?.Version ?? 0, plan?.OurTeamId, plan?.FirstPartnerId, plan?.SecondPartnerId,
            notes = plan?.Notes ?? "", plan?.UpdatedAt, teams,
            wishlist = (plan?.Wishlist ?? []).OrderBy(e => e.Position).Select(e => new
            {
                e.TeamId, e.Position, e.Reason
            }),
            suggestions
        });
    }

    [HttpPut]
    public async Task<IActionResult> Publish(int eventId, PublishAlliancePlan request)
    {
        if (request.Wishlist == null || request.Wishlist.Count > 100 ||
            request.Notes == null || request.Notes.Length > 4000 ||
            request.Wishlist.Any(e => e == null || e.Reason == null || e.Reason.Length > 2000))
            return BadRequest("Use at most 100 wishlist teams, 2,000 characters per reason, and 4,000 characters of notes.");
        var slots = new[] { request.OurTeamId, request.FirstPartnerId, request.SecondPartnerId }
            .Where(id => id.HasValue).Select(id => id!.Value).ToList();
        if (slots.Distinct().Count() != slots.Count ||
            request.Wishlist.Select(e => e.TeamId).Distinct().Count() != request.Wishlist.Count)
            return BadRequest("An alliance slot or wishlist cannot contain the same team twice.");
        await using var transaction = await db.Database.BeginTransactionAsync();
        if (!await db.Events.AnyAsync(e => e.Id == eventId)) return NotFound("Event not found.");
        var validIds = await EventTeamIds(eventId).ToListAsync();
        if (slots.Concat(request.Wishlist.Select(e => e.TeamId)).Any(id => !validIds.Contains(id)))
            return BadRequest("Choose teams registered or ranked at this event.");
        var plan = await db.AlliancePlans.Include(p => p.Wishlist).FirstOrDefaultAsync(p => p.EventId == eventId);
        if ((plan?.Version ?? 0) != request.Version)
            return Conflict("Another host updated this plan. Reload the published plan before saving.");
        if (plan == null)
        {
            plan = new AlliancePlan { EventId = eventId };
            db.AlliancePlans.Add(plan);
        }
        var wanted = request.Wishlist.Select(e => e.TeamId).ToHashSet();
        foreach (var old in plan.Wishlist.Where(e => !wanted.Contains(e.TeamId)).ToList())
        {
            db.AlliancePlanEntries.Remove(old);
            plan.Wishlist.Remove(old);
        }
        for (int i = 0; i < request.Wishlist.Count; i++)
        {
            var requested = request.Wishlist[i];
            var entry = plan.Wishlist.FirstOrDefault(e => e.TeamId == requested.TeamId);
            if (entry == null)
            {
                entry = new AlliancePlanEntry { EventId = eventId, TeamId = requested.TeamId };
                plan.Wishlist.Add(entry);
            }
            entry.Position = i + 1;
            entry.Reason = requested.Reason.Trim();
        }
        plan.OurTeamId = request.OurTeamId;
        plan.FirstPartnerId = request.FirstPartnerId;
        plan.SecondPartnerId = request.SecondPartnerId;
        plan.Notes = request.Notes.Trim();
        plan.Version++;
        plan.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Ok(new { plan.Version, plan.UpdatedAt });
    }

    [HttpPost("suggestions")]
    public async Task<IActionResult> Suggest(int eventId, SuggestAllianceTeam request)
    {
        if (request.Id == Guid.Empty || string.IsNullOrWhiteSpace(request.Author) ||
            request.Author.Length > 80 || string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Length > 2000)
            return BadRequest("Include your name/team (up to 80 characters) and a reason (up to 2,000 characters).");
        await using var transaction = await db.Database.BeginTransactionAsync();
        if (!await db.Events.AnyAsync(e => e.Id == eventId)) return NotFound("Event not found.");
        var previous = await db.AlliancePlanSuggestions.FindAsync(request.Id);
        if (previous != null)
        {
            if (previous.EventId != eventId || previous.TeamId != request.TeamId ||
                previous.Author != request.Author.Trim() || previous.Reason != request.Reason.Trim())
                return Conflict("This suggestion identifier was already used for different content.");
            return Ok(previous);
        }
        if (!await EventTeamIds(eventId).ContainsAsync(request.TeamId))
            return BadRequest("Choose a team registered or ranked at this event.");
        var suggestion = new AlliancePlanSuggestion
        {
            Id = request.Id, EventId = eventId, TeamId = request.TeamId,
            Author = request.Author.Trim(), Reason = request.Reason.Trim(), CreatedAt = DateTime.UtcNow
        };
        db.AlliancePlanSuggestions.Add(suggestion);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Ok(suggestion);
    }

    [HttpPost("suggestions/{id:guid}/review")]
    public async Task<IActionResult> Review(int eventId, Guid id, ReviewAllianceSuggestion request)
    {
        if (request.HostResponse == null || request.HostResponse.Length > 2000)
            return BadRequest("Keep the host response under 2,000 characters.");
        await using var transaction = await db.Database.BeginTransactionAsync();
        var suggestion = await db.AlliancePlanSuggestions.FirstOrDefaultAsync(s => s.Id == id && s.EventId == eventId);
        if (suggestion == null) return NotFound("Suggestion not found for this event.");
        if (suggestion.Status != "Pending") return Conflict("This suggestion was already reviewed.");
        var plan = await db.AlliancePlans.Include(p => p.Wishlist).FirstOrDefaultAsync(p => p.EventId == eventId);
        if ((plan?.Version ?? 0) != request.Version) return Conflict("The plan changed. Reload before reviewing.");
        if (request.Accept)
        {
            if (!await EventTeamIds(eventId).ContainsAsync(suggestion.TeamId))
                return BadRequest("This team is no longer registered or ranked at this event.");
            if (plan == null)
            {
                plan = new AlliancePlan { EventId = eventId };
                db.AlliancePlans.Add(plan);
            }
            if (!plan.Wishlist.Any(e => e.TeamId == suggestion.TeamId))
            {
                if (plan.Wishlist.Count >= 100) return BadRequest("The wishlist already has 100 teams.");
                plan.Wishlist.Add(new AlliancePlanEntry
                {
                    EventId = eventId, TeamId = suggestion.TeamId, Reason = suggestion.Reason,
                    Position = plan.Wishlist.Count + 1
                });
                plan.Version++;
                plan.UpdatedAt = DateTime.UtcNow;
            }
        }
        suggestion.Status = request.Accept ? "Accepted" : "Dismissed";
        suggestion.HostResponse = request.HostResponse.Trim();
        suggestion.ReviewedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Ok(suggestion);
    }
}
public class PublishAlliancePlan
{
    public long Version { get; set; }
    public int? OurTeamId { get; set; }
    public int? FirstPartnerId { get; set; }
    public int? SecondPartnerId { get; set; }
    public string Notes { get; set; } = "";
    public List<AlliancePlanEntryInput> Wishlist { get; set; } = new();
}
public class AlliancePlanEntryInput
{
    public int TeamId { get; set; }
    public string Reason { get; set; } = "";
}
public class SuggestAllianceTeam
{
    public Guid Id { get; set; }
    public int TeamId { get; set; }
    public string Author { get; set; } = "";
    public string Reason { get; set; } = "";
}
public class ReviewAllianceSuggestion
{
    public long Version { get; set; }
    public bool Accept { get; set; }
    public string HostResponse { get; set; } = "";
}
