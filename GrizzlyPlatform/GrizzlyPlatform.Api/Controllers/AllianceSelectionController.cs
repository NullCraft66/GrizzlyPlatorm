using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrizzlyPlatform.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AllianceSelectionController : ControllerBase
{
    private readonly GrizzlyDbContext _context;

    public AllianceSelectionController(GrizzlyDbContext context)
    {
        _context = context;
    }

    // DELETE: api/AllianceSelection/1
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteSelection(int id)
    {
        var selection = await _context.AllianceSelections
            .FirstOrDefaultAsync(s => s.Id == id);

        if (selection == null)
        {
            return NotFound("The specified Alliance Selection does not exist.");
        }

        _context.AllianceSelections.Remove(selection);

        await _context.SaveChangesAsync();

        return Ok(new
        {
            success = true,
            message = "Alliance Selection deleted successfully."
        });
    }

    // GET: api/AllianceSelection/event/1
    [HttpGet("event/{eventId}")]
    public async Task<IActionResult> GetForEvent(int eventId)
    {
        var eventExists = await _context.Events
            .AnyAsync(e => e.Id == eventId);

        if (!eventExists)
        {
            return NotFound("The specified event does not exist.");
        }

        var selection = await _context.AllianceSelections
            .Include(s => s.Alliances)
                .ThenInclude(a => a.CaptainTeam)
            .Include(s => s.Alliances)
                .ThenInclude(a => a.Members)
                    .ThenInclude(m => m.Team)
            .Include(s => s.Picks)
                .ThenInclude(p => p.InvitedTeam)
            .Include(s => s.Picks)
                .ThenInclude(p => p.InvitingTeam)
            .FirstOrDefaultAsync(s => s.EventId == eventId);

        if (selection == null)
        {
            return Ok(new
            {
                exists = false,
                eventId
            });
        }

        return Ok(new
        {
            exists = true,

            selection = new
            {
                id = selection.Id,
                eventId = selection.EventId,
                status = selection.Status,
                currentRound = selection.CurrentRound,
                currentAlliance = selection.CurrentAlliance,
                startedAt = selection.StartedAt,
                completedAt = selection.CompletedAt,

                alliances = selection.Alliances
                    .OrderBy(a => a.AllianceNumber)
                    .Select(a => new
                    {
                        id = a.Id,
                        allianceNumber = a.AllianceNumber,

                        captainTeamId = a.CaptainTeamId,
                        captainTeamNumber = a.CaptainTeam?.TeamNumber,
                        captainTeamName = a.CaptainTeam?.Name,

                        members = a.Members
                            .OrderBy(m => m.SelectionOrder)
                            .Select(m => new
                            {
                                teamId = m.TeamId,
                                teamNumber = m.Team?.TeamNumber,
                                teamName = m.Team?.Name,
                                selectionRound = m.SelectionRound,
                                selectionOrder = m.SelectionOrder
                            })
                    }),

                picks = selection.Picks
                    .OrderBy(p => p.Round)
                    .ThenBy(p => p.PickOrder)
                    .Select(p => new
                    {
                        id = p.Id,
                        allianceNumber = p.AllianceNumber,
                        round = p.Round,
                        pickOrder = p.PickOrder,

                        invitingTeamId = p.InvitingTeamId,
                        invitingTeamNumber = p.InvitingTeam?.TeamNumber,

                        invitedTeamId = p.InvitedTeamId,
                        invitedTeamNumber = p.InvitedTeam?.TeamNumber,

                        result = p.Result,
                        timestamp = p.Timestamp
                    })
            }
        });
    }

    // POST: api/AllianceSelection/start
    [HttpPost("start")]
    public async Task<IActionResult> StartSelection(
        StartAllianceSelectionRequest request)
    {
        await using var transaction = await _context.Database.BeginTransactionAsync();
        var eventEntity = await _context.Events
            .FirstOrDefaultAsync(e => e.Id == request.EventId);

        if (eventEntity == null)
        {
            return BadRequest(
                "The specified event does not exist.");
        }

        var existing = await _context.AllianceSelections
            .FirstOrDefaultAsync(s => s.EventId == request.EventId);

        if (existing != null)
        {
            return Conflict(
                "Alliance Selection has already been created for this event.");
        }

        if (request.TeamIds == null || request.TeamIds.Count != 8)
        {
            return BadRequest(
                "Exactly 8 alliance captain teams are required.");
        }


        if (request.RankedTeamIds == null || request.RankedTeamIds.Count < 8)
        {
            return BadRequest(
                "A complete ranked team list is required.");
        }

        if (request.RankedTeamIds.Distinct().Count() != request.RankedTeamIds.Count)
        {
            return BadRequest(
                "The ranked team list cannot contain duplicate teams.");
        }

        var rankedTeams = await _context.Teams
            .Where(t => request.RankedTeamIds.Contains(t.Id))
            .ToListAsync();

        if (rankedTeams.Count != request.RankedTeamIds.Count)
        {
            return BadRequest(
                "One or more ranked teams do not exist.");
        }

        if (!request.TeamIds.SequenceEqual(request.RankedTeamIds.Take(8)))
        {
            return BadRequest(
                "The first 8 ranked teams must be the alliance captains.");
        }

        var eventRankedIds = await _context.EventRankings
            .Where(r => r.EventId == request.EventId)
            .OrderBy(r => r.Rank).Select(r => r.TeamId).ToListAsync();
        if (!request.RankedTeamIds.SequenceEqual(eventRankedIds))
        {
            return BadRequest("Rankings changed or contain teams from another event. Refresh before starting.");
        }

        var selection = new AllianceSelection
        {
            EventId = request.EventId,
            Status = "InProgress",
            CurrentRound = 1,
            CurrentAlliance = 1,
            StartedAt = DateTime.UtcNow
        };

        _context.AllianceSelections.Add(selection);

        for (var i = 0; i < request.RankedTeamIds.Count; i++)
        {
            var rankedTeam = new AllianceRankedTeam
            {
                AllianceSelection = selection,
                TeamId = request.RankedTeamIds[i],
                Rank = i + 1
            };

            _context.AllianceRankedTeams.Add(rankedTeam);
        }

        for (var i = 0; i < 8; i++)
        {
            var alliance = new Alliance
            {
                AllianceSelection = selection,
                AllianceNumber = i + 1,
                CaptainTeamId = request.TeamIds[i]
            };

            _context.Alliances.Add(alliance);
        }

        await _context.SaveChangesAsync();

        await transaction.CommitAsync();
        return CreatedAtAction(
            nameof(GetForEvent),
            new { eventId = request.EventId },
            new
            {
                id = selection.Id,
                eventId = selection.EventId,
                status = selection.Status,
                currentRound = selection.CurrentRound,
                currentAlliance = selection.CurrentAlliance
            });
    }

// POST: api/AllianceSelection/pick
[HttpPost("pick")]
public async Task<IActionResult> PickTeam(PickAllianceTeamRequest request)
{
    await using var transaction = await _context.Database.BeginTransactionAsync();
    var selection = await _context.AllianceSelections
        .Include(s => s.Alliances)
            .ThenInclude(a => a.Members)
        .Include(s => s.Picks)
        .Include(s => s.RankedTeams)
        .FirstOrDefaultAsync(s => s.Id == request.AllianceSelectionId);

    if (selection == null)
    {
        return NotFound("The specified Alliance Selection does not exist.");
    }

    if (selection.Status != "InProgress")
    {
        return BadRequest("Alliance Selection is not currently in progress.");
    }

    if (selection.CurrentRound < 1 || selection.CurrentRound > 2)
    {
        return BadRequest("The Alliance Selection is in an invalid round.");
    }

    if (selection.CurrentAlliance < 1 || selection.CurrentAlliance > 8)
    {
        return BadRequest("The Alliance Selection is at an invalid alliance.");
    }

    // The client cannot choose whose turn it is.
    // The API determines the current alliance.
    if (request.AllianceNumber != selection.CurrentAlliance)
    {
        return BadRequest(
            $"It is currently Alliance {selection.CurrentAlliance}'s turn.");
    }

    var alliance = selection.Alliances
        .FirstOrDefault(a => a.AllianceNumber == selection.CurrentAlliance);

    if (alliance == null)
    {
        return BadRequest("The current alliance does not exist.");
    }

    if ((request.ExpectedRound.HasValue && request.ExpectedRound != selection.CurrentRound) ||
        (request.ExpectedPickCount.HasValue && request.ExpectedPickCount != selection.Picks.Count))
    {
        return Conflict("The draft has changed. Refresh before recording another invitation.");
    }

    if (!selection.RankedTeams.Any(r => r.TeamId == request.TeamId))
    {
        return BadRequest("This team is not in the event's saved ranked team list.");
    }

    var invitedCaptain = selection.Alliances.FirstOrDefault(a => a.CaptainTeamId == request.TeamId);
    if (invitedCaptain != null &&
        (selection.CurrentRound != 1 || invitedCaptain.AllianceNumber <= selection.CurrentAlliance ||
         invitedCaptain.Members.Count > 0))
    {
        return BadRequest("Only a later captain without selected members can be invited in round one.");
    }
    var team = await _context.Teams
        .FirstOrDefaultAsync(t => t.Id == request.TeamId);

    if (team == null)
    {
        return BadRequest("The specified team does not exist.");
    }

    if (alliance.CaptainTeamId == team.Id)
    {
        return BadRequest("An alliance captain cannot select itself.");
    }

    var alreadySelected = selection.Alliances
        .SelectMany(a => a.Members)
        .Any(m => m.TeamId == team.Id);

    if (alreadySelected)
    {
        return Conflict("This team has already been selected.");
    }
var alreadyDeclined = selection.Picks.Any(p =>
    p.InvitedTeamId == team.Id &&
    p.Result == "Declined");

if (alreadyDeclined)
{
    return Conflict("This team has already declined an alliance invitation.");
}

    // Determine whether the selected team is currently an alliance captain.
    var selectedCaptainAlliance = selection.Alliances
        .FirstOrDefault(a => a.CaptainTeamId == team.Id);

    var isCaptain = selectedCaptainAlliance != null;

    var existingMemberCount = alliance.Members.Count;

    if (existingMemberCount >= 2)
    {
        return BadRequest("This alliance already has two selected members.");
    }

    var selectionOrder = existingMemberCount + 1;

    AllianceRankedTeam? replacementCaptain = null;
    if (isCaptain)
    {
        var unavailableIds = selection.Alliances.Select(a => a.CaptainTeamId)
            .Concat(selection.Alliances.SelectMany(a => a.Members).Select(m => m.TeamId))
            .Append(team.Id).ToHashSet();
        replacementCaptain = selection.RankedTeams.OrderBy(r => r.Rank)
            .FirstOrDefault(r => !unavailableIds.Contains(r.TeamId));
        if (replacementCaptain == null)
            return BadRequest("No eligible team is available to become the new Alliance 8 captain.");
        if (!selection.Alliances.Any(a => a.AllianceNumber == 8))
            return BadRequest("Alliance 8 does not exist.");
    }
    // Add the selected team to the inviting alliance.
    var member = new AllianceMember
    {
        AllianceId = alliance.Id,
        TeamId = team.Id,
        SelectionRound = selection.CurrentRound,
        SelectionOrder = selectionOrder
    };

    _context.AllianceMembers.Add(member);

    // Record which team made the pick.
    var pick = new AlliancePick
    {
        AllianceSelectionId = selection.Id,
        AllianceNumber = selection.CurrentAlliance,
        Round = selection.CurrentRound,
        PickOrder = selection.Picks.Count + 1,
        InvitingTeamId = alliance.CaptainTeamId,
        InvitedTeamId = team.Id,
        Result = "Accepted",
        Timestamp = DateTime.UtcNow
    };

    _context.AlliancePicks.Add(pick);

    // If an alliance captain was selected, promote the remaining
    // alliance captains and fill Alliance 8 with the highest-ranked
    // eligible team.
    if (isCaptain && selectedCaptainAlliance != null)
    {
        var vacatedAllianceNumber = selectedCaptainAlliance.AllianceNumber;

        // Move the lower-ranked alliance captains up one alliance.
        for (var allianceNumber = vacatedAllianceNumber;
             allianceNumber < 8;
             allianceNumber++)
        {
            var currentAlliance = selection.Alliances
                .FirstOrDefault(
                    a => a.AllianceNumber == allianceNumber);

            var nextAlliance = selection.Alliances
                .FirstOrDefault(
                    a => a.AllianceNumber == allianceNumber + 1);

            if (currentAlliance != null && nextAlliance != null)
            {
                currentAlliance.CaptainTeamId =
                    nextAlliance.CaptainTeamId;
            }
        }

        var allianceEight = selection.Alliances.Single(a => a.AllianceNumber == 8);
        allianceEight.CaptainTeamId = replacementCaptain!.TeamId;
    }

    // Advance the state machine after the pick.
    //
    // Round 1: 1 -> 8
    // Round 2: 8 -> 1
    if (selection.CurrentRound == 1)
    {
        if (selection.CurrentAlliance < 8)
        {
            selection.CurrentAlliance++;
        }
        else
        {
            // Alliance 8 just made its pick. Begin Round 2.
            selection.CurrentRound = 2;
            selection.CurrentAlliance = 8;
        }
    }
    else
    {
        if (selection.CurrentAlliance > 1)
        {
            selection.CurrentAlliance--;
        }
        else
        {
            // Alliance 1 just made its final pick.
            selection.Status = "Completed";
            selection.CompletedAt = DateTime.UtcNow;
        }
    }

    await _context.SaveChangesAsync();
    await transaction.CommitAsync();

    return Ok(new
    {
        success = true,
        allianceNumber = alliance.AllianceNumber,
        teamId = team.Id,
        teamNumber = team.TeamNumber,
        selectionRound = pick.Round,
        selectionOrder,
        status = selection.Status,
        nextRound = selection.CurrentRound,
        nextAlliance = selection.CurrentAlliance
    });
}
// POST: api/AllianceSelection/decline
[HttpPost("decline")]
public async Task<IActionResult> DeclineTeam(PickAllianceTeamRequest request)
{
    await using var transaction = await _context.Database.BeginTransactionAsync();
    var selection = await _context.AllianceSelections
        .Include(s => s.Alliances)
            .ThenInclude(a => a.Members)
        .Include(s => s.Picks)
        .Include(s => s.RankedTeams)
        .FirstOrDefaultAsync(s => s.Id == request.AllianceSelectionId);

    if (selection == null)
    {
        return NotFound("The specified Alliance Selection does not exist.");
    }

    if (selection.Status != "InProgress")
    {
        return BadRequest("Alliance Selection is not currently in progress.");
    }

    if (selection.CurrentRound < 1 || selection.CurrentRound > 2)
    {
        return BadRequest("The Alliance Selection is in an invalid round.");
    }

    if (selection.CurrentAlliance < 1 || selection.CurrentAlliance > 8)
    {
        return BadRequest("The Alliance Selection is at an invalid alliance.");
    }

    if (request.AllianceNumber != selection.CurrentAlliance)
    {
        return BadRequest(
            $"It is currently Alliance {selection.CurrentAlliance}'s turn.");
    }

    var alliance = selection.Alliances
        .FirstOrDefault(a => a.AllianceNumber == selection.CurrentAlliance);

    if (alliance == null)
    {
        return BadRequest("The current alliance does not exist.");
    }

    if ((request.ExpectedRound.HasValue && request.ExpectedRound != selection.CurrentRound) ||
        (request.ExpectedPickCount.HasValue && request.ExpectedPickCount != selection.Picks.Count))
    {
        return Conflict("The draft has changed. Refresh before recording another invitation.");
    }

    if (!selection.RankedTeams.Any(r => r.TeamId == request.TeamId))
    {
        return BadRequest("This team is not in the event's saved ranked team list.");
    }

    var invitedCaptain = selection.Alliances.FirstOrDefault(a => a.CaptainTeamId == request.TeamId);
    if (invitedCaptain != null &&
        (selection.CurrentRound != 1 || invitedCaptain.AllianceNumber <= selection.CurrentAlliance ||
         invitedCaptain.Members.Count > 0))
    {
        return BadRequest("Only a later captain without selected members can be invited in round one.");
    }
    var team = await _context.Teams
        .FirstOrDefaultAsync(t => t.Id == request.TeamId);

    if (team == null)
    {
        return BadRequest("The specified team does not exist.");
    }

    if (alliance.CaptainTeamId == team.Id)
    {
        return BadRequest("An alliance captain cannot decline its own invitation.");
    }

    var alreadySelected = selection.Alliances
        .SelectMany(a => a.Members)
        .Any(m => m.TeamId == team.Id);

    if (alreadySelected)
    {
        return Conflict("This team has already been selected.");
    }

    var alreadyDeclined = selection.Picks.Any(p =>
        p.InvitedTeamId == team.Id &&
        p.Result == "Declined");

    if (alreadyDeclined)
    {
        return Conflict("This team has already declined an alliance invitation.");
    }

    var existingMemberCount = alliance.Members.Count;

    if (existingMemberCount >= 2)
    {
        return BadRequest(
            "This alliance already has two selected members.");
    }

    var selectionOrder = existingMemberCount + 1;

    var pick = new AlliancePick
    {
        AllianceSelectionId = selection.Id,
        AllianceNumber = selection.CurrentAlliance,
        Round = selection.CurrentRound,
        PickOrder = selection.Picks.Count + 1,
        InvitingTeamId = alliance.CaptainTeamId,
        InvitedTeamId = team.Id,
        Result = "Declined",
        Timestamp = DateTime.UtcNow
    };

    _context.AlliancePicks.Add(pick);

    // A declined invitation does not advance the alliance.
    // The same captain may invite another eligible team.
    await _context.SaveChangesAsync();
    await transaction.CommitAsync();

    return Ok(new
    {
        success = true,
        allianceNumber = alliance.AllianceNumber,
        teamId = team.Id,
        teamNumber = team.TeamNumber,
        result = "Declined",
        selectionRound = selection.CurrentRound,
        selectionOrder,
        status = selection.Status,
        nextRound = selection.CurrentRound,
        nextAlliance = selection.CurrentAlliance
    });
}
}



public class StartAllianceSelectionRequest
{
    public int EventId { get; set; }

    public List<int> TeamIds { get; set; } = new();

    public List<int> RankedTeamIds { get; set; } = new();
}

public class PickAllianceTeamRequest
{
    public int AllianceSelectionId { get; set; }

    public int? ExpectedRound { get; set; }

    public int? ExpectedPickCount { get; set; }

    public int AllianceNumber { get; set; }

    public int TeamId { get; set; }
}






