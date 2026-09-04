using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Dtos;
using GrizzlyPlatform.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrizzlyPlatform.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GameFormSubmissionsController : ControllerBase
{
    private readonly GrizzlyDbContext _context;

    public GameFormSubmissionsController(GrizzlyDbContext context)
    {
        _context = context;
    }

    // GET: api/GameFormSubmissions
    [HttpGet]
    public async Task<IActionResult> GetSubmissions(
        [FromQuery] int? seasonId,
        [FromQuery] int? year,
        [FromQuery] string? formType)
    {
        var query = _context.GameFormSubmissions
            .Include(s => s.GameForm)
                .ThenInclude(g => g!.Season)
            .Include(s => s.Match)
            .Include(s => s.Team)
            .Include(s => s.Answers)
                .ThenInclude(a => a.GameFormField)
            .AsQueryable();

        if (seasonId.HasValue)
        {
            query = query.Where(s => s.GameForm!.SeasonId == seasonId.Value);
        }

        if (year.HasValue)
        {
            query = query.Where(s => s.GameForm!.Season!.Year == year.Value);
        }

        if (!string.IsNullOrWhiteSpace(formType))
        {
            if (!Enum.TryParse<GameFormType>(
                    formType,
                    ignoreCase: true,
                    out var parsedFormType))
            {
                return BadRequest(
                    "Form type must be Pit or Match.");
            }

            query = query.Where(s => s.GameForm!.FormType == parsedFormType);
        }

        var submissions = await query
            .OrderByDescending(s => s.SubmittedAt)
            .ToListAsync();

        var result = submissions.Select(s => new
        {
            id = s.Id,
            gameFormId = s.GameFormId,
            gameFormName = s.GameForm?.Name,
            formType = s.GameForm?.FormType.ToString(),

            seasonId = s.GameForm?.SeasonId,
            seasonYear = s.GameForm?.Season?.Year,
            seasonName = s.GameForm?.Season?.Name,

            matchId = s.MatchId,
            matchNumber = s.Match?.MatchNumber,

            teamId = s.TeamId,
            teamNumber = s.Team?.TeamNumber,
            teamName = s.Team?.Name,

            submittedAt = s.SubmittedAt,

            answers = s.Answers.Select(a => new
            {
                fieldId = a.GameFormFieldId,
                question = a.GameFormField?.Question,
                value = a.Value
            })
        });

        return Ok(result);
    }

    // GET: api/GameFormSubmissions/3
    [HttpGet("{id}")]
    public async Task<IActionResult> GetSubmission(int id)
    {
        var submission = await _context.GameFormSubmissions
            .Include(s => s.GameForm)
            .Include(s => s.Match)
            .Include(s => s.Team)
            .Include(s => s.Answers)
                .ThenInclude(a => a.GameFormField)
            .FirstOrDefaultAsync(s => s.Id == id);

        if (submission == null)
        {
            return NotFound();
        }

        var result = new
        {
            id = submission.Id,
            gameFormId = submission.GameFormId,
            gameFormName = submission.GameForm?.Name,

            matchId = submission.MatchId,
            matchNumber = submission.Match?.MatchNumber,

            teamId = submission.TeamId,
            teamNumber = submission.Team?.TeamNumber,
            teamName = submission.Team?.Name,

            submittedAt = submission.SubmittedAt,

            answers = submission.Answers.Select(a => new
            {
                fieldId = a.GameFormFieldId,
                question = a.GameFormField?.Question,
                value = a.Value
            })
        };

        return Ok(result);
    }

    // POST: api/GameFormSubmissions
    [HttpPost]
    public async Task<IActionResult> CreateSubmission(
        GameFormSubmission submission)
    {
        // Make sure the Game Form exists.
        var gameForm = await _context.GameForms
            .Include(g => g.Fields)
            .FirstOrDefaultAsync(g => g.Id == submission.GameFormId);

        if (gameForm == null)
        {
            return BadRequest(
                "The specified game form does not exist.");
        }

        // Make sure the Match exists.
        var match = await _context.Matches
            .FirstOrDefaultAsync(m => m.Id == submission.MatchId);

        if (match == null)
        {
            return BadRequest(
                "The specified match does not exist.");
        }

        // Make sure the Team exists.
        var team = await _context.Teams
            .FindAsync(submission.TeamId);

        if (team == null)
        {
            return BadRequest(
                "The specified team does not exist.");
        }

        // Make sure the selected team participated in the match.
        var teamParticipated =
            match.RedTeam1Id == submission.TeamId ||
            match.RedTeam2Id == submission.TeamId ||
            match.RedTeam3Id == submission.TeamId ||
            match.BlueTeam1Id == submission.TeamId ||
            match.BlueTeam2Id == submission.TeamId ||
            match.BlueTeam3Id == submission.TeamId;

        if (!teamParticipated)
        {
            return BadRequest(
                "The specified team did not participate in the selected match.");
        }

        // Make sure every answer belongs to this game form.
        foreach (var answer in submission.Answers)
        {
            var field = gameForm.Fields
                .FirstOrDefault(f => f.Id == answer.GameFormFieldId);

            if (field == null)
            {
                return BadRequest(
                    $"Field {answer.GameFormFieldId} does not belong to this game form.");
            }
        }

        // Make sure every required field has an answer.
        foreach (var field in gameForm.Fields.Where(f => f.Required))
        {
            var answer = submission.Answers
                .FirstOrDefault(a => a.GameFormFieldId == field.Id);

            if (answer == null || string.IsNullOrWhiteSpace(answer.Value))
            {
                return BadRequest(
                    $"Required field '{field.Question}' is missing an answer.");
            }
        }

        submission.SubmittedAt = DateTime.UtcNow;

        _context.GameFormSubmissions.Add(submission);

        await _context.SaveChangesAsync();

        // Return the newly created submission using the clean format.
        var result = new
        {
            id = submission.Id,
            gameFormId = submission.GameFormId,
            gameFormName = gameForm.Name,

            matchId = submission.MatchId,
            matchNumber = match.MatchNumber,

            teamId = submission.TeamId,
            teamNumber = team.TeamNumber,
            teamName = team.Name,

            submittedAt = submission.SubmittedAt,

            answers = submission.Answers.Select(a => new
            {
                fieldId = a.GameFormFieldId,
                question = gameForm.Fields
                    .First(f => f.Id == a.GameFormFieldId)
                    .Question,
                value = a.Value
            })
        };

        return CreatedAtAction(
            nameof(GetSubmission),
            new { id = submission.Id },
            result);
    }

    // POST: api/GameFormSubmissions/scout
 // POST: api/GameFormSubmissions/scout
[HttpPost("scout")]
public async Task<IActionResult> CreateScoutSubmission(
    ScoutSubmissionRequest request)
{
    var gameForm = await _context.GameForms
        .Include(g => g.Fields)
        .FirstOrDefaultAsync(g => g.Id == request.GameFormId);

    if (gameForm == null)
    {
        return BadRequest(
            "The specified game form does not exist.");
    }

    var team = await _context.Teams
        .FirstOrDefaultAsync(t =>
            t.TeamNumber == request.TeamNumber);

    if (team == null)
    {
        return BadRequest(
            "The specified team number does not exist.");
    }

    Match? match = null;

    if (gameForm.FormType == GameFormType.Match)
    {
        if (!request.EventId.HasValue ||
            !request.MatchNumber.HasValue)
        {
            return BadRequest(
                "Match scouting requires an event and match number.");
        }

        var matchQuery = _context.Matches
            .Where(m =>
                m.EventId == request.EventId.Value &&
                m.MatchNumber == request.MatchNumber.Value);

        if (!string.IsNullOrWhiteSpace(request.MatchType))
        {
            matchQuery = matchQuery.Where(m =>
                m.MatchType == request.MatchType);
        }

        if (request.SetNumber.HasValue &&
            request.SetNumber.Value > 0)
        {
            matchQuery = matchQuery.Where(m =>
                m.SetNumber == request.SetNumber.Value);
        }

        match = await matchQuery.FirstOrDefaultAsync();

        if (match == null)
        {
            return BadRequest(
                "The specified match does not exist.");
        }

        var teamParticipated =
            match.RedTeam1Id == team.Id ||
            match.RedTeam2Id == team.Id ||
            match.RedTeam3Id == team.Id ||
            match.BlueTeam1Id == team.Id ||
            match.BlueTeam2Id == team.Id ||
            match.BlueTeam3Id == team.Id;

        if (!teamParticipated)
        {
            return BadRequest(
                "The specified team did not participate in the selected match.");
        }
    }

    var answers = request.Answers.ToList();

    AddSystemAnswerIfMissing(
        answers,
        gameForm,
        "Team Number",
        request.TeamNumber.ToString());

    if (gameForm.FormType == GameFormType.Match)
    {
        AddSystemAnswerIfMissing(
            answers,
            gameForm,
            "Match Number",
            request.MatchNumber!.Value.ToString());
    }

    AddSystemAnswerIfMissing(
        answers,
        gameForm,
        "Scout Name",
        request.ScoutName);

    foreach (var answer in answers)
    {
        var field = gameForm.Fields
            .FirstOrDefault(f =>
                f.Id == answer.GameFormFieldId);

        if (field == null)
        {
            return BadRequest(
                $"Field {answer.GameFormFieldId} does not belong to this game form.");
        }
    }

    foreach (var field in gameForm.Fields.Where(f =>
        f.Required))
    {
        var answer = answers.FirstOrDefault(a =>
            a.GameFormFieldId == field.Id);

        if (answer == null ||
            string.IsNullOrWhiteSpace(answer.Value))
        {
            return BadRequest(
                $"Required field '{field.Question}' is missing an answer.");
        }
    }

// Prevent duplicate submissions for the same form, team, and match.
var existingSubmissionQuery =
    _context.GameFormSubmissions
        .Where(s =>
            s.GameFormId == gameForm.Id &&
            s.TeamId == team.Id);

if (match != null)
{
    existingSubmissionQuery =
        existingSubmissionQuery.Where(s =>
            s.MatchId == match.Id);
}
else
{
    existingSubmissionQuery =
        existingSubmissionQuery.Where(s =>
            s.MatchId == null);
}

var existingSubmission =
    await existingSubmissionQuery.FirstOrDefaultAsync();

if (existingSubmission != null)
{
    return Conflict(
        "A submission for this team already exists.");
}

    var submission = new GameFormSubmission
    {
        GameFormId = gameForm.Id,
        TeamId = team.Id,
        MatchId = match?.Id,
        SubmittedAt = DateTime.UtcNow,
        Answers = answers
            .Select(a => new GameFormAnswer
            {
                GameFormFieldId =
                    a.GameFormFieldId,
                Value = a.Value
            })
            .ToList()
    };

    _context.GameFormSubmissions.Add(
        submission);

    await _context.SaveChangesAsync();

    var result = new
    {
        id = submission.Id,
        gameFormId = gameForm.Id,
        gameFormName = gameForm.Name,
        formType = gameForm.FormType.ToString(),

        eventId = match?.EventId,
        matchId = match?.Id,
        matchNumber = match?.MatchNumber,
        matchType = match?.MatchType,
        setNumber = match?.SetNumber,

        teamId = team.Id,
        teamNumber = team.TeamNumber,
        teamName = team.Name,

        submittedAt = submission.SubmittedAt,

        answers = submission.Answers.Select(a =>
            new
            {
                fieldId = a.GameFormFieldId,
                question = gameForm.Fields
                    .First(f =>
                        f.Id == a.GameFormFieldId)
                    .Question,
                value = a.Value
            })
    };

    return CreatedAtAction(
        nameof(GetSubmission),
        new { id = submission.Id },
        result);
}

    private static void AddSystemAnswerIfMissing(
        List<ScoutAnswerRequest> answers,
        GameForm gameForm,
        string question,
        string value)
    {
        var field = gameForm.Fields
            .FirstOrDefault(f =>
                string.Equals(
                    f.Question,
                    question,
                    StringComparison.OrdinalIgnoreCase));

        if (field == null)
        {
            return;
        }

        var answer = answers
            .FirstOrDefault(a => a.GameFormFieldId == field.Id);

        if (answer == null)
        {
            answers.Add(new ScoutAnswerRequest
            {
                GameFormFieldId = field.Id,
                Value = value
            });
        }
        else if (string.IsNullOrWhiteSpace(answer.Value))
        {
            answer.Value = value;
        }
    }

// PUT: api/GameFormSubmissions/5
[HttpPut("{id}")]
public async Task<IActionResult> UpdateSubmission(
    int id,
    UpdateSubmissionRequest updatedSubmission)
{
    var submission = await _context.GameFormSubmissions
        .Include(s => s.GameForm)
            .ThenInclude(g => g!.Fields)
        .Include(s => s.Answers)
        .FirstOrDefaultAsync(s => s.Id == id);

    if (submission == null)
    {
        return NotFound();
    }

    var gameForm = submission.GameForm;

    if (gameForm == null)
    {
        return BadRequest(
            "The game form for this submission no longer exists."
        );
    }

    // Validate every answer against the original form.
    foreach (var answer in updatedSubmission.Answers)
    {
        var field = gameForm.Fields
            .FirstOrDefault(f =>
                f.Id == answer.GameFormFieldId);

        if (field == null)
        {
            return BadRequest(
                $"Field {answer.GameFormFieldId} does not belong to this game form."
            );
        }
    }

    // Make sure every required field has an answer.
    foreach (var field in gameForm.Fields.Where(f => f.Required))
    {
        var answer = updatedSubmission.Answers
            .FirstOrDefault(a =>
                a.GameFormFieldId == field.Id);

        if (answer == null ||
            string.IsNullOrWhiteSpace(answer.Value))
        {
            return BadRequest(
                $"Required field '{field.Question}' is missing an answer."
            );
        }
    }

    // Remove the old answers.
    _context.GameFormAnswers.RemoveRange(
        submission.Answers
    );

    // Replace them with the edited answers.
    submission.Answers =
        updatedSubmission.Answers
            .Select(a => new GameFormAnswer
            {
                GameFormFieldId =
                    a.GameFormFieldId,
                Value = a.Value 
            })
            .ToList();

    // Preserve the original team, form, match,
    // and submission time.
    await _context.SaveChangesAsync();

    return Ok(new
    {
        id = submission.Id,
        gameFormId = submission.GameFormId,
        gameFormName = gameForm.Name,

        teamId = submission.TeamId,
        matchId = submission.MatchId,

        submittedAt = submission.SubmittedAt,

        answers = submission.Answers.Select(a => new
        {
            fieldId = a.GameFormFieldId,
            question = gameForm.Fields
                .First(f =>
                    f.Id == a.GameFormFieldId)
                .Question,
            value = a.Value
        })
    });
}

}
