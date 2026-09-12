using System.Text.Json;
using GrizzlyPlatform.Api.Controllers;
using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

using var connection = new SqliteConnection("Data Source=:memory:");
await connection.OpenAsync();
var options = new DbContextOptionsBuilder<GrizzlyDbContext>()
    .UseSqlite(connection).Options;
await using var db = new GrizzlyDbContext(options);
await db.Database.MigrateAsync();

var seasonA = new Season { Year = 2026, Name = "Season A" };
var seasonB = new Season { Year = 2027, Name = "Season B" };
db.Seasons.AddRange(seasonA, seasonB);
await db.SaveChangesAsync();
var eventA = new Event { Name = "Event A", SeasonId = seasonA.Id };
var eventB = new Event { Name = "Event B", SeasonId = seasonA.Id };
var eventC = new Event { Name = "Event C", SeasonId = seasonB.Id };
var pitA = new GameForm { Name = "Pit A", SeasonId = seasonA.Id, FormType = GameFormType.Pit };
var pitB = new GameForm { Name = "Pit B", SeasonId = seasonB.Id, FormType = GameFormType.Pit };
var matchForm = new GameForm { Name = "Match A", SeasonId = seasonA.Id, FormType = GameFormType.Match };
var team = new Team { TeamNumber = 66, Name = "Grizzly" };
db.AddRange(eventA, eventB, eventC, pitA, pitB, matchForm, team);
await db.SaveChangesAsync();

var configuration = new ActiveScoutingConfigurationController(db);
var submissions = new GameFormSubmissionsController(db);
int checks = 0;
void Check(bool condition, string description)
{
    if (!condition) throw new Exception("FAILED: " + description);
    checks++;
    Console.WriteLine("PASS: " + description);
}
JsonElement Json(IActionResult result)
{
    if (result is not ObjectResult obj)
        throw new Exception("Expected an object result.");
    return JsonSerializer.SerializeToElement(obj.Value,
        new JsonSerializerOptions(JsonSerializerDefaults.Web));
}
ScoutSubmissionRequest Pit(GameForm form, Event eventItem) => new()
{
    GameFormId = form.Id, TeamNumber = team.TeamNumber,
    EventId = eventItem.Id, ScoutName = "Regression test"
};
ActiveScoutingConfiguration Preset(Season season, Event eventItem, GameForm form) => new()
{
    ActiveSeasonId = season.Id, ActiveEventId = eventItem.Id, ActivePitFormId = form.Id
};

Check(Json(await configuration.GetConfiguration()).GetProperty("activeEventId").ValueKind ==
    JsonValueKind.Null, "No preset keeps manual event selection");
Check(await configuration.UpdateDeviceConfiguration(Preset(seasonA, eventA, pitA))
    is OkObjectResult, "Save season and event preset");
db.ChangeTracker.Clear();
Check(Json(await configuration.GetConfiguration()).GetProperty("activeEventId").GetInt32() ==
    eventA.Id, "Preset persists after reloading database state");
Check(await configuration.UpdateDeviceConfiguration(Preset(seasonA, eventC, pitA))
    is BadRequestObjectResult, "Reject event from another season");
Check(await configuration.UpdateDeviceConfiguration(Preset(seasonA, eventA, pitB))
    is BadRequestObjectResult, "Reject form from another season");
Check(await configuration.UpdateDeviceConfiguration(new()
{
    ActiveEventId = eventA.Id
}) is BadRequestObjectResult, "Reject event without season");
Check(await configuration.UpdateDeviceConfiguration(new()
{
    ActiveSeasonId = 999999
}) is BadRequestObjectResult, "Reject missing season");
Check(Json(await configuration.GetConfiguration()).GetProperty("activeEventId").GetInt32() ==
    eventA.Id, "Failed configuration saves preserve the current preset");
Check(await configuration.UpdateConfiguration(new()
{
    ActivePitFormId = pitA.Id, ActiveMatchFormId = matchForm.Id
}) is OkObjectResult, "Existing form toggle endpoint still works");
Check(Json(await configuration.GetConfiguration()).GetProperty("activeEventId").GetInt32() ==
    eventA.Id, "Form toggles do not clear the event preset");
Check(await configuration.UpdateConfiguration(new() { ActivePitFormId = pitB.Id })
    is BadRequestObjectResult, "Form toggles cannot mix active seasons");

var createdA = await submissions.CreateScoutSubmission(Pit(pitA, eventA));
Check(createdA is CreatedAtActionResult, "Create pit submission for preset event");
int submissionAId = Json(createdA).GetProperty("id").GetInt32();
Check(Json(createdA).GetProperty("eventId").GetInt32() == eventA.Id,
    "Pit creation response includes event");
Check(await submissions.CreateScoutSubmission(Pit(pitA, eventA)) is ConflictObjectResult,
    "Duplicate pit submission at the same event is rejected");
Check(await configuration.UpdateDeviceConfiguration(Preset(seasonA, eventB, pitA))
    is OkObjectResult, "Switch active event");
var createdB = await submissions.CreateScoutSubmission(Pit(pitA, eventB));
Check(createdB is CreatedAtActionResult,
    "Same team can submit the same pit form at a different event");
Check(Json(await submissions.GetSubmission(submissionAId)).GetProperty("eventId").GetInt32()
    == eventA.Id, "Switching presets preserves the original submission event");

// A form opened at event A can finish after devices switch to another season.
Check(await configuration.UpdateDeviceConfiguration(Preset(seasonB, eventC, pitB))
    is OkObjectResult, "Switch active season");
var secondTeam = new Team { TeamNumber = 67, Name = "Other team" };
db.Teams.Add(secondTeam);
await db.SaveChangesAsync();
var inProgress = Pit(pitA, eventA);
inProgress.TeamNumber = secondTeam.TeamNumber;
Check(await submissions.CreateScoutSubmission(inProgress) is CreatedAtActionResult,
    "In-progress forms retain their selected season and event");
Check(await submissions.CreateScoutSubmission(Pit(pitB, eventC)) is CreatedAtActionResult,
    "New season submissions use that season's form and event");
Check(await submissions.CreateScoutSubmission(Pit(pitA, eventC)) is BadRequestObjectResult,
    "Reject cross-season submission event");

var seasonAResults = Json(await submissions.GetSubmissions(seasonA.Id, null, "Pit"));
Check(seasonAResults.GetArrayLength() == 3 &&
    seasonAResults.EnumerateArray().All(s => s.GetProperty("seasonId").GetInt32() == seasonA.Id),
    "Season filter remains independent of the active season");
Check(seasonAResults.EnumerateArray().Count(s => s.GetProperty("eventId").GetInt32() == eventA.Id) == 2,
    "Website event filter can read persisted pit event IDs");
var eventBResults = Json(await submissions.GetSubmissionsForEvent(eventB.Id));
Check(eventBResults.GetArrayLength() == 1 &&
    eventBResults[0].GetProperty("eventId").GetInt32() == eventB.Id,
    "Event endpoint returns the correct pit event");
Check(Json(await submissions.GetSubmissions(null, 2027, "Pit")).GetArrayLength() == 1,
    "Year filter includes only the matching season");

// Older match submissions may have an event only through their match.
var match = new Match
{
    EventId = eventA.Id, MatchNumber = 1,
    RedTeam1Id = team.Id, RedTeam2Id = team.Id, RedTeam3Id = team.Id,
    BlueTeam1Id = team.Id, BlueTeam2Id = team.Id, BlueTeam3Id = team.Id
};
db.Matches.Add(match);
await db.SaveChangesAsync();
db.GameFormSubmissions.Add(new()
{
    GameFormId = matchForm.Id, MatchId = match.Id, TeamId = team.Id
});
await db.SaveChangesAsync();
var matchResults = Json(await submissions.GetSubmissions(seasonA.Id, null, "Match"));
Check(matchResults.GetArrayLength() == 1 &&
    matchResults[0].GetProperty("eventId").GetInt32() == eventA.Id,
    "Historical match submissions use their match's event");
Check(await configuration.UpdateDeviceConfiguration(new()
{
    ActivePitFormId = pitB.Id
}) is OkObjectResult, "Clear event and season presets for manual selection");
Check(Json(await configuration.GetConfiguration()).GetProperty("activeEventId").ValueKind ==
    JsonValueKind.Null, "Clearing presets persists");

int submissionCount = await db.GameFormSubmissions.CountAsync();
var migrations = (await db.Database.GetAppliedMigrationsAsync()).ToArray();
Check(migrations.Last().EndsWith("_AddDeviceEventConfiguration"),
    "Device migration is the latest migration");
db.ChangeTracker.Clear();
await db.GetService<IMigrator>().MigrateAsync(migrations[^2]);
await db.Database.MigrateAsync();
db.ChangeTracker.Clear();
Check(await db.GameFormSubmissions.CountAsync() == submissionCount,
    "Additive migration preserves existing submissions");
Check((await db.ActiveScoutingConfigurations.SingleAsync()).ActivePitFormId == pitB.Id,
    "Migration preserves existing active form configuration");
Check(!(await db.Database.GetPendingMigrationsAsync()).Any(),
    "All database migrations applied");
Console.WriteLine($"All {checks} device configuration regression checks passed.");