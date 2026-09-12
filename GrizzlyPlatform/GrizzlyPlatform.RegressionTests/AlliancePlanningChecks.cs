using System.Text.Json;
using GrizzlyPlatform.Api.Controllers;
using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

internal static class AlliancePlanningChecks
{
    public static async Task Run()
    {
        int checks = 0;
        void Check(bool pass, string description)
        {
            if (!pass) throw new Exception("FAILED: " + description);
            checks++;
            Console.WriteLine("PASS: " + description);
        }
        JsonElement Json(IActionResult result) => JsonSerializer.SerializeToElement(((ObjectResult)result).Value,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<GrizzlyDbContext>().UseSqlite(connection).Options;
        await using var db = new GrizzlyDbContext(options);
        await db.Database.MigrateAsync();
        var season = new Season { Year = 2026, Name = "Planning" };
        db.Seasons.Add(season);
        await db.SaveChangesAsync();
        var eventA = new Event { SeasonId = season.Id, Name = "A" };
        var eventB = new Event { SeasonId = season.Id, Name = "B" };
        var teams = Enumerable.Range(1, 5).Select(i => new Team { TeamNumber = i, Name = $"Robot {i}" }).ToArray();
        db.AddRange(eventA, eventB);
        db.Teams.AddRange(teams);
        await db.SaveChangesAsync();
        db.EventTeams.AddRange(teams.Take(4).Select(t => new EventTeam { EventId = eventA.Id, TeamId = t.Id }));
        db.EventTeams.Add(new EventTeam { EventId = eventB.Id, TeamId = teams[4].Id });
        db.EventRankings.Add(new EventRanking { EventId = eventA.Id, TeamId = teams[3].Id, Rank = 1 });
        await db.SaveChangesAsync();
        var api = new AlliancePlansController(db);
        var empty = Json(await api.Get(eventA.Id));
        Check(empty.GetProperty("version").GetInt64() == 0 && empty.GetProperty("wishlist").GetArrayLength() == 0,
            "New event has an empty planning board");
        Check(empty.GetProperty("teams").GetArrayLength() == 4, "Planning roster merges memberships and rankings without duplicates");
        Check(await api.Get(99999) is NotFoundObjectResult, "Missing event returns not found");

        var suggestion = new SuggestAllianceTeam
        {
            Id = Guid.NewGuid(), TeamId = teams[2].Id, Author = "Alex / Team 66",
            Reason = "Reliable scoring and complements our endgame."
        };
        Check(await api.Suggest(eventA.Id, suggestion) is OkObjectResult, "Device can submit a named suggestion with a reason");
        Check(Json(await api.Get(eventA.Id)).GetProperty("wishlist").GetArrayLength() == 0,
            "Device suggestions never change the host wishlist before review");
        Check(await api.Suggest(eventA.Id, suggestion) is OkObjectResult &&
            await db.AlliancePlanSuggestions.CountAsync() == 1, "Retrying the same request does not duplicate a suggestion");
        Check(await api.Suggest(eventB.Id, suggestion) is ConflictObjectResult,
            "Suggestion request IDs cannot be reused at another event");
        Check(await api.Suggest(eventA.Id, new() { Id = Guid.NewGuid(), TeamId = teams[4].Id, Author = "A", Reason = "B" })
            is BadRequestObjectResult, "Devices cannot suggest teams from a different event");
        Check(await api.Suggest(eventA.Id, new() { Id = Guid.NewGuid(), TeamId = teams[1].Id, Author = "", Reason = "" })
            is BadRequestObjectResult, "Anonymous or empty suggestions are rejected");

        var plan = new PublishAlliancePlan
        {
            Version = 0, OurTeamId = teams[0].Id, FirstPartnerId = teams[1].Id,
            Notes = "Prioritize reliability; coordinate endgame roles.",
            Wishlist = new()
            {
                new() { TeamId = teams[1].Id, Reason = "Best first partner." },
                new() { TeamId = teams[3].Id, Reason = "Good backup." }
            }
        };
        Check(await api.Publish(eventA.Id, plan) is OkObjectResult, "Host can publish alliance slots, notes, and ordered reasons");
        db.ChangeTracker.Clear();
        var published = Json(await api.Get(eventA.Id));
        Check(published.GetProperty("ourTeamId").GetInt32() == teams[0].Id &&
            published.GetProperty("firstPartnerId").GetInt32() == teams[1].Id &&
            published.GetProperty("notes").GetString() == plan.Notes,
            "Devices can read the proposed alliance and strategy");
        Check(published.GetProperty("wishlist")[0].GetProperty("teamId").GetInt32() == teams[1].Id &&
            published.GetProperty("wishlist")[0].GetProperty("reason").GetString() == "Best first partner.",
            "Published priority and reasons persist");
        Check(await api.Publish(eventA.Id, plan) is ConflictObjectResult, "Stale host publish cannot overwrite a newer plan");

        plan.Version = 1;
        plan.Wishlist.Reverse();
        Check(await api.Publish(eventA.Id, plan) is OkObjectResult, "Host can reorder the wishlist");
        Check(Json(await api.Get(eventA.Id)).GetProperty("wishlist")[0].GetProperty("teamId").GetInt32() == teams[3].Id,
            "New ordering is visible to devices");
        plan.Version = 2;
        plan.SecondPartnerId = teams[1].Id;
        Check(await api.Publish(eventA.Id, plan) is BadRequestObjectResult, "Same team cannot fill two alliance slots");
        plan.SecondPartnerId = teams[4].Id;
        Check(await api.Publish(eventA.Id, plan) is BadRequestObjectResult, "Host cannot put a foreign-event team in the alliance");
        plan.SecondPartnerId = null;
        plan.Wishlist.Add(new() { TeamId = teams[1].Id });
        Check(await api.Publish(eventA.Id, plan) is BadRequestObjectResult, "Wishlist cannot contain duplicate teams");
        plan.Wishlist.RemoveAt(plan.Wishlist.Count - 1);

        Check(await api.Review(eventB.Id, suggestion.Id, new() { Version = 2, Accept = true }) is NotFoundObjectResult,
            "Host cannot review another event's suggestion");
        Check(await api.Review(eventA.Id, suggestion.Id, new() { Version = 1, Accept = true }) is ConflictObjectResult,
            "Review respects the current published version");
        Check(await api.Review(eventA.Id, suggestion.Id, new()
        {
            Version = 2, Accept = true, HostResponse = "Agreed. Added as a second-pick candidate."
        }) is OkObjectResult, "Host can accept a suggestion with feedback");
        db.ChangeTracker.Clear();
        var accepted = Json(await api.Get(eventA.Id));
        Check(accepted.GetProperty("wishlist").GetArrayLength() == 3 &&
            accepted.GetProperty("wishlist")[2].GetProperty("reason").GetString() == suggestion.Reason,
            "Accepted suggestion appends its reason without disrupting priority");
        var feedback = accepted.GetProperty("suggestions")[0];
        Check(feedback.GetProperty("status").GetString() == "Accepted" &&
            feedback.GetProperty("hostResponse").GetString()!.Contains("Agreed"),
            "Devices can see review status and host feedback");
        Check(await api.Publish(eventA.Id, plan) is ConflictObjectResult,
            "Draft made before acceptance cannot erase the accepted suggestion");
        Check(await api.Review(eventA.Id, suggestion.Id, new() { Version = 3, Accept = false }) is ConflictObjectResult,
            "Reviewed suggestions cannot be processed twice");

        var duplicateTeam = new SuggestAllianceTeam
        {
            Id = Guid.NewGuid(), TeamId = teams[1].Id, Author = "Partner scout", Reason = "Additional observation"
        };
        await api.Suggest(eventA.Id, duplicateTeam);
        Check(await api.Review(eventA.Id, duplicateTeam.Id, new() { Version = 3, Accept = true }) is OkObjectResult,
            "Host can acknowledge a suggestion for an existing wishlist team");
        Check(await db.AlliancePlanEntries.CountAsync() == 3 &&
            (await db.AlliancePlanEntries.SingleAsync(e => e.TeamId == teams[1].Id)).Reason == "Best first partner.",
            "Accepting an existing team preserves the host's reason and avoids duplicates");
        var dismiss = new SuggestAllianceTeam
        {
            Id = Guid.NewGuid(), TeamId = teams[3].Id, Author = "Field scout", Reason = "Consider their defense"
        };
        await api.Suggest(eventA.Id, dismiss);
        Check(await api.Review(eventA.Id, dismiss.Id, new() { Version = 3, Accept = false, HostResponse = "Already covered." })
            is OkObjectResult, "Host can dismiss suggestions with an explanation");
        Check((await db.AlliancePlanSuggestions.FindAsync(dismiss.Id))!.Status == "Dismissed" &&
            await db.AlliancePlanEntries.CountAsync() == 3, "Dismissal leaves the published wishlist unchanged");
        Check(Json(await api.Get(eventB.Id)).GetProperty("suggestions").GetArrayLength() == 0 &&
            Json(await api.Get(eventB.Id)).GetProperty("wishlist").GetArrayLength() == 0,
            "Event plans and feedback remain isolated");
        Check(await db.AllianceSelections.CountAsync() == 0, "Planning does not create or alter the official draft");
        plan.Version = 3;
        plan.Wishlist.RemoveAt(0);
        Check(await api.Publish(eventA.Id, plan) is OkObjectResult, "Host can remove wishlist teams and publish a revised plan");
        var last = Json(await api.Get(eventA.Id));
        Check(last.GetProperty("wishlist").GetArrayLength() == 1 &&
            last.GetProperty("wishlist")[0].GetProperty("position").GetInt32() == 1,
            "Removing teams keeps priorities consecutive");
        Console.WriteLine($"All {checks} alliance planning checks passed.");
    }
}