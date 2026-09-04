using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Register Entity Framework Core with SQLite.
builder.Services.AddDbContext<GrizzlyDbContext>(options =>
    options.UseSqlite("Data Source=grizzlyplatform.db"));

builder.Services.AddHttpClient<TheBlueAllianceService>(client =>
{
    client.BaseAddress = new Uri("https://www.thebluealliance.com/api/v3/");
});

builder.Services.AddHostedService<LiveEventSyncService>();

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

app.MapGet("/", () => "GRIZZLY PLATFORM CURRENT BUILD");

app.MapGet("/api/test", () => new
{
    status = "online",
    message = "NEW TEST ENDPOINT"
});

app.UseCors("ScoutingClients");

app.MapControllers();

app.Run();
