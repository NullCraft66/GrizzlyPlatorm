using GrizzlyPlatform.Api.Controllers;
using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

internal static class NexusRegressionChecks
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

        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<GrizzlyDbContext>().UseSqlite(connection).Options;
        await using var db = new GrizzlyDbContext(options);
        await db.Database.MigrateAsync();
        var season = new Season { Year = 2026, Name = "Nexus" };
        db.Seasons.Add(season);
        await db.SaveChangesAsync();
        var eventItem = new Event { SeasonId = season.Id, Name = "Nexus Test Event" };
        db.Events.Add(eventItem);
        await db.SaveChangesAsync();

        var controller = new EventsController(db, null!);
        Check(await controller.UpdateNexusKey(eventItem.Id, new NexusEventKeyUpdate { NexusEventKey = "demo6686" }) is OkObjectResult,
            "Valid Nexus event key is accepted");
        db.ChangeTracker.Clear();
        Check((await db.Events.FindAsync(eventItem.Id))!.NexusEventKey == "demo6686",
            "Nexus event key persists on the host event");
        Check(await controller.UpdateNexusKey(eventItem.Id, new NexusEventKeyUpdate()) is BadRequestObjectResult,
            "Blank Nexus event key is rejected");
        Check(await controller.UpdateNexusKey(999999, new NexusEventKeyUpdate { NexusEventKey = "demo6686" }) is NotFoundResult,
            "Missing host event returns not found");
        Check(!(await db.Database.GetPendingMigrationsAsync()).Any(),
            "Nexus migration is applied in the regression database");
        Console.WriteLine($"All {checks} Nexus regression checks passed.");
    }
}
