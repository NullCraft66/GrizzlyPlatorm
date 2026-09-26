using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Models;
using GrizzlyPlatform.Api.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: false);

// Register Entity Framework Core with SQLite.
builder.Services.AddDbContext<GrizzlyDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("Default") ?? "Data Source=grizzlyplatform.db"));
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

    var authService = scope.ServiceProvider
        .GetRequiredService<AuthService>();

    var configuration = scope.ServiceProvider
        .GetRequiredService<IConfiguration>();

    var adminUsername =
        configuration["AdminUsername"];

    var adminPassword =
        configuration["AdminPassword"];

    if (!string.IsNullOrWhiteSpace(adminUsername) &&
        !string.IsNullOrWhiteSpace(adminPassword))
    {
        var existingAdmin =
            await authService.FindByUsernameAsync(
                adminUsername);

        if (existingAdmin == null)
        {
            await authService.CreateUserAsync(
                adminUsername,
                "Administrator",
                adminPassword,
                "Admin");
        }
    }
}

app.MapGet("/", () => "GRIZZLY PLATFORM CURRENT BUILD");

app.UseCors("ScoutingClients");

app.MapControllers();

app.Run();
