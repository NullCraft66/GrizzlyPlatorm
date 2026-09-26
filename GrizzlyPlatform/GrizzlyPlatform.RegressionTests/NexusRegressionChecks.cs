using System.Net;
using System.Text.Json;
using GrizzlyPlatform.Api.Controllers;
using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Models;
using GrizzlyPlatform.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

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

        var localDiscoveryConfiguration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>())
            .Build();
        var localDiscovery = CreateDiscoveryController(
            localDiscoveryConfiguration,
            "http",
            new HostString("192.168.1.25", 5263));
        var localPairing = JsonSerializer.SerializeToElement(
            ((OkObjectResult)localDiscovery.Pairing()).Value,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Check(localPairing.GetProperty("address").GetString() == "http://192.168.1.25:5263/api/" &&
            localPairing.GetProperty("localNetwork").GetBoolean(),
            "LAN pairing keeps the request host and API port");

        var hostedDiscoveryConfiguration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["LocalNetwork:Enabled"] = "false",
                ["PublicApiBaseUrl"] = "https://grizzly-platform.example.workers.dev/api/",
                ["PublicHostName"] = "Grizzly Platform"
            })
            .Build();
        var hostedDiscovery = CreateDiscoveryController(
            hostedDiscoveryConfiguration,
            "http",
            new HostString("127.0.0.1", 5263));
        var hostedPairing = JsonSerializer.SerializeToElement(
            ((OkObjectResult)hostedDiscovery.Pairing()).Value,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var hostedDiagnostics = JsonSerializer.SerializeToElement(
            ((OkObjectResult)hostedDiscovery.Diagnostics()).Value,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Check(hostedPairing.GetProperty("address").GetString() ==
            "https://grizzly-platform.example.workers.dev/api/" &&
            !hostedPairing.GetProperty("localNetwork").GetBoolean() &&
            hostedPairing.GetProperty("mdns").GetString() == "",
            "Cloud pairing uses its configured HTTPS URL without advertising LAN discovery");
        Check(hostedDiagnostics.GetProperty("tcpPort").GetInt32() == 443 &&
            hostedDiagnostics.GetProperty("discoveryPort").ValueKind == JsonValueKind.Null &&
            !hostedDiagnostics.GetProperty("localNetwork").GetBoolean(),
            "Hosted diagnostics do not claim local UDP or mDNS discovery");
        var incompleteHostedConfiguration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["LocalNetwork:Enabled"] = "false"
            })
            .Build();
        var incompleteHostedDiscovery = CreateDiscoveryController(
            incompleteHostedConfiguration,
            "http",
            new HostString("127.0.0.1", 5263));
        try
        {
            incompleteHostedDiscovery.Pairing();
            Check(false, "Hosted pairing requires an explicit public API URL");
        }
        catch (InvalidOperationException)
        {
            Check(true, "Hosted pairing requires an explicit public API URL");
        }

        var temporaryRoot = Path.Combine(Path.GetTempPath(), "grizzly-nexus-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(temporaryRoot);
        try
        {
            var settingsPath = Path.Combine(temporaryRoot, "nexus-settings.json");
            var keyRingPath = Path.Combine(temporaryRoot, "protection-keys");
            Directory.CreateDirectory(keyRingPath);
            var configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["NexusSettings:FilePath"] = settingsPath
                })
                .Build();
            var protection = DataProtectionProvider.Create(new DirectoryInfo(keyRingPath));
            var settingsStore = new NexusSettingsStore(
                configuration,
                new TestHostEnvironment(temporaryRoot),
                protection);

            settingsStore.Save(new NexusSettings
            {
                ApiKey = "test-nexus-secret",
                EventKey = "demo1234",
                Enabled = true
            });
            Check(!File.ReadAllText(settingsPath).Contains("test-nexus-secret", StringComparison.Ordinal),
                "Nexus API key is encrypted at rest");
            Check(settingsStore.Get().ApiKey == "test-nexus-secret",
                "Protected Nexus API key can be read with its persisted key ring");

            var handler = new RecordingHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("""{"eventKey":"demo1234","matches":[]}""")
            });
            using var http = new HttpClient(handler)
            {
                BaseAddress = new Uri("https://frc.nexus/api/v1/")
            };
            var service = new NexusService(http, settingsStore);
            using var nexusEvent = await service.GetEventAsync("demo1234");
            Check(nexusEvent?.RootElement.GetProperty("eventKey").GetString() == "demo1234",
                "Nexus event response is returned as JSON");
            Check(handler.LastRequestUri?.AbsolutePath == "/api/v1/event/demo1234" &&
                handler.LastApiKey == "test-nexus-secret",
                "Nexus request uses the documented path and API-key header");

            var settingsController = new NexusSettingsController(settingsStore, service);
            var publicSettings = settingsController.Get() as OkObjectResult;
            var publicSettingsJson = JsonSerializer.SerializeToElement(
                publicSettings?.Value,
                new JsonSerializerOptions(JsonSerializerDefaults.Web));
            Check(publicSettingsJson.GetProperty("configured").GetBoolean() &&
                !publicSettingsJson.TryGetProperty("apiKey", out _),
                "Settings endpoint reports key presence without disclosing the key");

            var saveResult = settingsController.Save(new NexusSettings
            {
                ApiKey = "",
                EventKey = "next-event",
                Enabled = true
            }) as OkObjectResult;
            var saveJson = JsonSerializer.SerializeToElement(
                saveResult?.Value,
                new JsonSerializerOptions(JsonSerializerDefaults.Web));
            Check(saveJson.GetProperty("configured").GetBoolean() &&
                settingsStore.Get().ApiKey == "test-nexus-secret",
                "Updating Nexus event settings preserves a key omitted by the UI");

            var missingHandler = new RecordingHandler(_ => new HttpResponseMessage(HttpStatusCode.NotFound));
            using var missingHttp = new HttpClient(missingHandler)
            {
                BaseAddress = new Uri("https://frc.nexus/api/v1/")
            };
            var missingService = new NexusService(missingHttp, settingsStore);
            Check(await missingService.GetPitsAsync("not-a-real-event") is null,
                "Missing Nexus resource is represented as unavailable data");
        }
        finally
        {
            Directory.Delete(temporaryRoot, recursive: true);
        }

        Console.WriteLine($"All {checks} Nexus regression checks passed.");
    }

    private sealed class RecordingHandler(Func<HttpRequestMessage, HttpResponseMessage> respond)
        : HttpMessageHandler
    {
        public Uri? LastRequestUri { get; private set; }
        public string? LastApiKey { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            LastRequestUri = request.RequestUri;
            LastApiKey = request.Headers.TryGetValues("Nexus-Api-Key", out var values)
                ? values.SingleOrDefault()
                : null;
            return Task.FromResult(respond(request));
        }
    }

    private sealed class TestHostEnvironment(string contentRootPath) : IHostEnvironment
    {
        public string ApplicationName { get; set; } = "GrizzlyPlatform.RegressionTests";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
        public string ContentRootPath { get; set; } = contentRootPath;
        public string EnvironmentName { get; set; } = "Development";
    }

    private static DiscoveryController CreateDiscoveryController(
        IConfiguration configuration,
        string scheme,
        HostString host)
    {
        var controller = new DiscoveryController(configuration);
        var context = new DefaultHttpContext();
        context.Request.Scheme = scheme;
        context.Request.Host = host;
        controller.ControllerContext = new ControllerContext { HttpContext = context };
        return controller;
    }
}
