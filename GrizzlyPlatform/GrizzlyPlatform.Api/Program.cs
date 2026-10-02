using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Models;
using GrizzlyPlatform.Api.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: false);

// Register Entity Framework Core with SQLite.
builder.Services.AddDbContext<GrizzlyDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("Default") ?? "Data Source=grizzlyplatform.db")
        .ConfigureWarnings(w => w.Ignore(RelationalEventId.PendingModelChangesWarning)));
builder.Services.AddScoped<AuthService>();
builder.Services.AddDataProtection();
builder.Services.AddSingleton<NexusSettingsStore>();
builder.Services.AddHttpClient<NexusService>(client =>
{
    client.BaseAddress = new Uri("https://frc.nexus/api/v1/");
    client.Timeout = TimeSpan.FromSeconds(15);
});

builder.Services.AddHttpClient<TheBlueAllianceService>(client =>
{
    client.BaseAddress = new Uri("https://www.thebluealliance.com/api/v3/");
});

builder.Services.AddScoped<EventSyncService>();
builder.Services.AddHostedService<LiveEventSyncService>();

if (builder.Configuration.GetValue("LocalNetwork:Enabled", true))
{
    builder.Services.AddHostedService<HostDiscoveryService>();
    builder.Services.AddHostedService<MdnsAdvertisementService>();
}

builder.Services.AddCors(options =>
{
    options.AddPolicy("ScoutingClients", policy =>
    {
        policy
            .AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

// Register ASP.NET Core controllers.
builder.Services.AddControllers()
    .AddApplicationPart(typeof(GrizzlyPlatform.Api.Controllers.HealthController).Assembly);

// Keep OpenAPI enabled for development.
builder.Services.AddOpenApi();

var app = builder.Build();

// Create the initial admin account if one does not exist.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<GrizzlyDbContext>();
    await db.Database.MigrateAsync();
    await db.Database.ExecuteSqlRawAsync("ALTER TABLE Users ADD COLUMN AllowedPages TEXT NOT NULL DEFAULT '*'").ContinueWith(_ => { });

    var authService = scope.ServiceProvider
        .GetRequiredService<AuthService>();

    var configuration = scope.ServiceProvider
        .GetRequiredService<IConfiguration>();

    var seedFile = configuration["AccountSeedFile"];
    if (!string.IsNullOrWhiteSpace(seedFile))
    {
        var seedPath = Path.IsPathRooted(seedFile)
            ? seedFile
            : Path.Combine(AppContext.BaseDirectory, seedFile);

        if (File.Exists(seedPath))
        {
            var seed = JsonSerializer.Deserialize<AccountSeed>(
                await File.ReadAllTextAsync(seedPath),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            foreach (var account in seed?.Accounts ?? [])
            {
                if (string.IsNullOrWhiteSpace(account.Username) || string.IsNullOrWhiteSpace(account.Password))
                    continue;
                var existing = await authService.FindByUsernameAsync(account.Username);
                if (existing == null)
                    await authService.CreateUserAsync(account.Username, account.DisplayName ?? account.Username, account.Password, account.Role ?? "Scout");
                else if (account.UpdateExisting)
                {
                    existing.DisplayName = account.DisplayName ?? existing.DisplayName;
                    existing.Role = account.Role ?? existing.Role;
                    existing.IsActive = true;
                    await authService.SetPasswordAsync(existing, account.Password);
                }
            }
        }
    }
}

app.MapGet("/", () => "GRIZZLY PLATFORM CURRENT BUILD");

app.UseCors("ScoutingClients");

app.MapControllers();

app.Run();

public sealed class AccountSeed { public List<AccountSeedEntry> Accounts { get; set; } = []; }
public sealed class AccountSeedEntry
{
    public string Username { get; set; } = "";
    public string? DisplayName { get; set; }
    public string? Password { get; set; }
    public string? Role { get; set; }
    public bool UpdateExisting { get; set; }
}
