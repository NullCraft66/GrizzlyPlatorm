using System.Net;
using System.Reflection;
using System.Text;
using System.Text.Json;
using GrizzlyPlatform.Api.Controllers;
using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Models;
using GrizzlyPlatform.Web.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using AlliancePage = GrizzlyPlatform.Web.Components.Pages.AllianceSelection;

internal static class AllianceSelectionChecks
{
    private static int checks;
    private static void Check(bool value, string description)
    {
        if (!value) throw new Exception("FAILED: " + description);
        checks++;
        Console.WriteLine("PASS: " + description);
    }

    public static async Task Run()
    {
        Check(ScoutingAnswerFilter.Matches(1, "3.5", "3.25"), "Decimal minimum scouting filter");
        Check(!ScoutingAnswerFilter.Matches(1, "2", "3"), "Below-minimum answer excluded");
        Check(!ScoutingAnswerFilter.Matches(1, "bad", "3"), "Invalid numeric answer excluded");
        Check(ScoutingAnswerFilter.Matches(2, "True", "Yes"), "Yes/no filter accepts boolean encoding");
        Check(ScoutingAnswerFilter.Matches(2, "No", "false"), "No filter accepts text encoding");
        Check(ScoutingAnswerFilter.Matches(3, " High ", "high"), "Dropdown comparison ignores case and whitespace");
        Check(ScoutingAnswerFilter.Matches(4, "false", "false"), "Unchecked checkbox filter matches");
        Check(!ScoutingAnswerFilter.Matches(4, "true", "false"), "Opposite checkbox answer excluded");
        Check(ScoutingAnswerFilter.Matches(5, """["Low","High"]""", "high"), "Multiselect matches an array member");
        Check(!ScoutingAnswerFilter.Matches(5, """["Low"]""", "high"), "Multiselect excludes absent option");
        Check(ScoutingAnswerFilter.Matches(5, "High", "high"), "Legacy single multiselect value supported");
        Check(!ScoutingAnswerFilter.Matches(2, null, "No"), "Missing answer is not interpreted as No");

        await PageChecks();

        using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<GrizzlyDbContext>().UseSqlite(connection).Options;
        await using var db = new GrizzlyDbContext(options);
        await db.Database.MigrateAsync();
        var season = new Season { Year = 2026, Name = "Draft test" };
        db.Seasons.Add(season);
        await db.SaveChangesAsync();
        var eventItem = new Event { Name = "Draft event", SeasonId = season.Id };
        db.Events.Add(eventItem);
        var teams = Enumerable.Range(1, 32).Select(i => new Team { TeamNumber = i, Name = $"Team {i}" }).ToArray();
        db.Teams.AddRange(teams);
        await db.SaveChangesAsync();
        db.EventRankings.AddRange(teams.Take(30).Select((t, i) => new EventRanking
        {
            EventId = eventItem.Id, TeamId = t.Id, Rank = i + 1
        }));
        await db.SaveChangesAsync();
        var api = new AllianceSelectionController(db);
        var start = new StartAllianceSelectionRequest
        {
            EventId = eventItem.Id, TeamIds = teams.Take(8).Select(t => t.Id).ToList(),
            RankedTeamIds = teams.Take(30).Select(t => t.Id).ToList()
        };
        var invalid = new StartAllianceSelectionRequest
        {
            EventId = eventItem.Id, TeamIds = start.TeamIds,
            RankedTeamIds = start.RankedTeamIds.SkipLast(1).Append(teams[31].Id).ToList()
        };
        Check(await api.StartSelection(invalid) is BadRequestObjectResult, "Start rejects rankings from another event");
        Check(await api.StartSelection(start) is CreatedAtActionResult, "Start creates eight alliances");
        Check(await api.StartSelection(start) is ConflictObjectResult, "Existing event draft cannot be started twice");
        int selectionId = await db.AllianceSelections.Select(s => s.Id).SingleAsync();

        async Task<AllianceSelection> State()
        {
            db.ChangeTracker.Clear();
            return await db.AllianceSelections.Include(s => s.Alliances).ThenInclude(a => a.Members)
                .Include(s => s.Picks).SingleAsync();
        }
        async Task<PickAllianceTeamRequest> Request(int teamId)
        {
            var state = await State();
            return new()
            {
                AllianceSelectionId = selectionId, AllianceNumber = state.CurrentAlliance,
                ExpectedRound = state.CurrentRound, ExpectedPickCount = state.Picks.Count, TeamId = teamId
            };
        }

        Check(await api.PickTeam(await Request(teams[31].Id)) is BadRequestObjectResult,
            "Cannot pick a team outside the saved event rankings");
        Check(await api.DeclineTeam(await Request(teams[31].Id)) is BadRequestObjectResult,
            "Cannot decline a team outside the saved event rankings");
        Check(await api.PickTeam(await Request(teams[0].Id)) is BadRequestObjectResult,
            "Captain cannot invite itself");
        var wrongTurn = await Request(teams[10].Id);
        wrongTurn.AllianceNumber = 2;
        Check(await api.PickTeam(wrongTurn) is BadRequestObjectResult, "Server enforces current alliance");
        Check(await api.PickTeam(await Request(teams[1].Id)) is OkObjectResult, "Captain can accept an earlier captain's invitation");
        var promoted = await State();
        Check(promoted.Alliances.Single(a => a.AllianceNumber == 2).CaptainTeamId == teams[2].Id &&
            promoted.Alliances.Single(a => a.AllianceNumber == 8).CaptainTeamId == teams[8].Id,
            "Captain promotion shifts later captains and fills alliance eight");
        Check(promoted.Alliances.Single(a => a.AllianceNumber == 1).Members.Single().TeamId == teams[1].Id,
            "Invited captain is saved as an alliance member");
        Check(await api.PickTeam(await Request(teams[0].Id)) is BadRequestObjectResult,
            "Cannot invite an earlier captain with an existing alliance");
        var decline = await Request(teams[9].Id);
        Check(await api.DeclineTeam(decline) is OkObjectResult, "Record declined invitation");
        var afterDecline = await State();
        Check(afterDecline.CurrentAlliance == 2 && afterDecline.CurrentRound == 1,
            "Decline keeps the same alliance's turn");
        Check(await api.PickTeam(await Request(teams[9].Id)) is ConflictObjectResult,
            "Declined team cannot subsequently accept an invitation");
        Check(await api.DeclineTeam(await Request(teams[9].Id)) is ConflictObjectResult,
            "Duplicate decline rejected");
        decline.TeamId = teams[10].Id;
        Check(await api.PickTeam(decline) is ConflictObjectResult, "Stale invitation rejected after a decline");

        int nextTeam = 10;
        while ((await State()).CurrentRound == 1)
        {
            var request = await Request(teams[nextTeam++].Id);
            Check(await api.PickTeam(request) is OkObjectResult, "Round-one invitation accepted");
            var state = await State();
            if (state.CurrentRound == 2)
            {
                Check(state.CurrentAlliance == 8, "Round two starts at alliance eight");
                request.TeamId = teams[nextTeam].Id;
                Check(await api.PickTeam(request) is ConflictObjectResult,
                    "Stale round-one request rejected at alliance-eight round boundary");
            }
        }
        Check(await api.PickTeam(await Request(teams[2].Id)) is BadRequestObjectResult,
            "Captains cannot be invited during round two");
        Check(await api.PickTeam(await Request(teams[1].Id)) is ConflictObjectResult,
            "Already selected member cannot be selected twice");
        while ((await State()).Status == "InProgress")
        {
            var request = await Request(teams[nextTeam++].Id);
            Check(await api.PickTeam(request) is OkObjectResult, "Round-two invitation accepted");
            var state = await State();
            Check(state.Status == "Completed" || state.CurrentAlliance == request.AllianceNumber - 1,
                "Round two moves from alliance eight toward one");
        }
        var completed = await State();
        Check(completed.Alliances.All(a => a.Members.Count == 2) && completed.CompletedAt != null &&
            completed.Picks.Count(p => p.Result == "Accepted") == 16, "Full draft completes with eight three-team alliances");
        Check(await api.PickTeam(await Request(teams[29].Id)) is BadRequestObjectResult,
            "Completed draft rejects further picks");
        Check(await api.DeclineTeam(await Request(teams[29].Id)) is BadRequestObjectResult,
            "Completed draft rejects further declines");
        Console.WriteLine($"All {checks} alliance selection checks passed.");
    }

    // Exercise the page's actual loading/filtering code against HTTP-shaped responses.
    private static async Task PageChecks()
    {
        var page = new AlliancePage();
        var type = typeof(AlliancePage);
        const BindingFlags flags = BindingFlags.Instance | BindingFlags.NonPublic;
        object? Get(string name) => type.GetField(name, flags)!.GetValue(page);
        void Set(string name, object value) => type.GetField(name, flags)!.SetValue(page, value);
        async Task Call(string name) => await (Task)type.GetMethod(name, flags)!.Invoke(page, null)!;
        bool Matches(string value) => (bool)type.GetMethod("TeamMatchesScoutingFilter", flags)!
            .Invoke(page, new object[] { 1, 10, value })!;
        using var http = new HttpClient(new FixtureHandler()) { BaseAddress = new Uri("http://fixture/") };
        type.GetProperty("Http", flags)!.SetValue(page, http);
        Set("selectedEventId", 1);
        await Call("Reload");
        Check((int)Get("selectedPitFormId")! == 1, "Page chooses active pit form instead of newer form");
        Check(((System.Collections.ICollection)Get("filteredTeams")!).Count == 8,
            "Page reads rankings as a JSON array");
        Check(Matches("Yes"), "Page uses this event and form despite newer submissions elsewhere");
        Check(!Matches("No"), "Another event's or form's answer cannot override selected event");
        var filters = (Dictionary<int, string>)Get("scoutingFilters")!;
        filters[10] = "No";
        var filtered = (System.Collections.IEnumerable)type.GetMethod("GetFilteredAndSortedTeams", flags)!.Invoke(page, null)!;
        Check(!filtered.Cast<object>().Any(), "Filtered empty state reflects the actual filtered result");
        Set("selectedEventId", 0);
        await Call("EventChanged");
        Check(((System.Collections.ICollection)Get("filteredTeams")!).Count == 0 &&
            ((Dictionary<int, string>)Get("scoutingFilters")!).Count == 0,
            "Switching away clears event teams and scouting filters");
    }

    private sealed class FixtureHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            var path = request.RequestUri!.AbsolutePath;
            string json = path switch
            {
                "/api/Events" => """[{"id":1,"seasonId":1,"name":"Event A"}]""",
                "/api/AllianceSelection/event/1" => """{"exists":false}""",
                "/api/EventRankings/event/1" => JsonSerializer.Serialize(Enumerable.Range(1, 8).Select(i =>
                    new { teamId = i, teamNumber = i, teamName = $"Team {i}", rank = i })),
                "/api/ActiveScoutingConfiguration" => """{"activePitFormId":1}""",
                "/api/GameForms" => """
                    [{"id":1,"seasonId":1,"formType":0,"name":"Active","fields":[{"id":10,"question":"Climb","fieldType":2}]},
                     {"id":2,"seasonId":1,"formType":0,"name":"Newer","fields":[]}]
                    """,
                "/api/GameFormSubmissions/event/1" => """
                    [{"id":1,"teamId":1,"eventId":1,"gameFormId":1,"submittedAt":"2026-01-01T00:00:00Z","answers":[{"fieldId":10,"value":"Yes"}]},
                     {"id":2,"teamId":1,"eventId":2,"gameFormId":1,"submittedAt":"2026-02-01T00:00:00Z","answers":[{"fieldId":10,"value":"No"}]},
                     {"id":3,"teamId":1,"eventId":1,"gameFormId":2,"submittedAt":"2026-03-01T00:00:00Z","answers":[{"fieldId":10,"value":"No"}]}]
                    """,
                _ => throw new Exception("Unexpected API request: " + path)
            };
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            });
        }
    }
}