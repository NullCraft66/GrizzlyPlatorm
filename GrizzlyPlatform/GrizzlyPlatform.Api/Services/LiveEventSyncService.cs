using GrizzlyPlatform.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace GrizzlyPlatform.Api.Services;

public class LiveEventSyncService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<LiveEventSyncService> _logger;

    public LiveEventSyncService(
        IServiceScopeFactory scopeFactory,
        ILogger<LiveEventSyncService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(
        CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Live Event Sync Service started.");

        // Give the API a moment to finish starting.
        await Task.Delay(
            TimeSpan.FromSeconds(5),
            stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SyncAllEventsAsync(stoppingToken);
            }
            catch (OperationCanceledException)
                when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Error during live event synchronization.");
            }

            try
            {
                await Task.Delay(
                    TimeSpan.FromSeconds(30),
                    stoppingToken);
            }
            catch (OperationCanceledException)
                when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }

        _logger.LogInformation(
            "Live Event Sync Service stopped.");
    }

    private async Task SyncAllEventsAsync(
        CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();

        var context =
            scope.ServiceProvider
                .GetRequiredService<GrizzlyDbContext>();

        var blueAllianceService =
            scope.ServiceProvider
                .GetRequiredService<TheBlueAllianceService>();

        var events = await context.Events
            .Where(e =>
                !string.IsNullOrWhiteSpace(
                    e.BlueAllianceKey))
            .ToListAsync(cancellationToken);

        _logger.LogInformation(
            "Live sync checking {Count} events.",
            events.Count);

        foreach (var eventItem in events)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                return;
            }

            try
            {
                await SyncEventAsync(
                    context,
                    blueAllianceService,
                    eventItem,
                    cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Failed to sync event {EventId} ({EventName}).",
                    eventItem.Id,
                    eventItem.Name);
            }
        }
    }

    private async Task SyncEventAsync(
        GrizzlyDbContext context,
        TheBlueAllianceService blueAllianceService,
        Models.Event eventItem,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(
            eventItem.BlueAllianceKey))
        {
            return;
        }

        var matches =
            await blueAllianceService.GetEventMatchesAsync(
                eventItem.BlueAllianceKey);

        var imported = 0;
        var updated = 0;
        var skipped = 0;

        foreach (var matchJson in matches.EnumerateArray())
        {
            cancellationToken.ThrowIfCancellationRequested();

            var compLevel =
                matchJson.GetProperty("comp_level")
                    .GetString() ?? "qm";

            var matchNumber =
                matchJson.GetProperty("match_number")
                    .GetInt32();

            var setNumber =
                matchJson.GetProperty("set_number")
                    .GetInt32();

            var matchType = compLevel switch
            {
                "qm" => "Qualification",
                "ef" => "EighthFinal",
                "qf" => "Quarterfinal",
                "sf" => "Semifinal",
                "f" => "Final",
                _ => compLevel
            };

            var alliances =
                matchJson.GetProperty("alliances");

            var red =
                alliances.GetProperty("red");

            var blue =
                alliances.GetProperty("blue");

            var redTeams = red
                .GetProperty("team_keys")
                .EnumerateArray()
                .Select(x => x.GetString())
                .Where(x =>
                    !string.IsNullOrWhiteSpace(x))
                .ToList();

            var blueTeams = blue
                .GetProperty("team_keys")
                .EnumerateArray()
                .Select(x => x.GetString())
                .Where(x =>
                    !string.IsNullOrWhiteSpace(x))
                .ToList();

            if (redTeams.Count < 3 ||
                blueTeams.Count < 3)
            {
                skipped++;
                continue;
            }

            var redTeam1Number =
                ParseTeamNumber(redTeams[0]!);

            var redTeam2Number =
                ParseTeamNumber(redTeams[1]!);

            var redTeam3Number =
                ParseTeamNumber(redTeams[2]!);

            var blueTeam1Number =
                ParseTeamNumber(blueTeams[0]!);

            var blueTeam2Number =
                ParseTeamNumber(blueTeams[1]!);

            var blueTeam3Number =
                ParseTeamNumber(blueTeams[2]!);

            var redTeam1 =
                await context.Teams.FirstOrDefaultAsync(
                    t => t.TeamNumber == redTeam1Number,
                    cancellationToken);

            var redTeam2 =
                await context.Teams.FirstOrDefaultAsync(
                    t => t.TeamNumber == redTeam2Number,
                    cancellationToken);

            var redTeam3 =
                await context.Teams.FirstOrDefaultAsync(
                    t => t.TeamNumber == redTeam3Number,
                    cancellationToken);

            var blueTeam1 =
                await context.Teams.FirstOrDefaultAsync(
                    t => t.TeamNumber == blueTeam1Number,
                    cancellationToken);

            var blueTeam2 =
                await context.Teams.FirstOrDefaultAsync(
                    t => t.TeamNumber == blueTeam2Number,
                    cancellationToken);

            var blueTeam3 =
                await context.Teams.FirstOrDefaultAsync(
                    t => t.TeamNumber == blueTeam3Number,
                    cancellationToken);

            if (redTeam1 == null ||
                redTeam2 == null ||
                redTeam3 == null ||
                blueTeam1 == null ||
                blueTeam2 == null ||
                blueTeam3 == null)
            {
                skipped++;
                continue;
            }

            var redScore =
                red.GetProperty("score").GetInt32();

            var blueScore =
                blue.GetProperty("score").GetInt32();

            var winningAlliance =
                matchJson.TryGetProperty(
                    "winning_alliance",
                    out var winner)
                    ? winner.GetString()
                    : null;

            var existingMatch =
                await context.Matches.FirstOrDefaultAsync(
                    m =>
                        m.EventId == eventItem.Id &&
                        m.MatchType == matchType &&
                        m.MatchNumber == matchNumber &&
                        m.SetNumber == setNumber,
                    cancellationToken);

            if (existingMatch != null)
            {
                existingMatch.RedTeam1Id = redTeam1.Id;
                existingMatch.RedTeam2Id = redTeam2.Id;
                existingMatch.RedTeam3Id = redTeam3.Id;

                existingMatch.BlueTeam1Id = blueTeam1.Id;
                existingMatch.BlueTeam2Id = blueTeam2.Id;
                existingMatch.BlueTeam3Id = blueTeam3.Id;

                existingMatch.RedScore = redScore;
                existingMatch.BlueScore = blueScore;
                existingMatch.WinningAlliance =
                    winningAlliance;

                updated++;
            }
            else
            {
                context.Matches.Add(new Models.Match
                {
                    EventId = eventItem.Id,

                    MatchType = matchType,
                    MatchNumber = matchNumber,
                    SetNumber = setNumber,

                    RedTeam1Id = redTeam1.Id,
                    RedTeam2Id = redTeam2.Id,
                    RedTeam3Id = redTeam3.Id,

                    BlueTeam1Id = blueTeam1.Id,
                    BlueTeam2Id = blueTeam2.Id,
                    BlueTeam3Id = blueTeam3.Id,

                    RedScore = redScore,
                    BlueScore = blueScore,
                    WinningAlliance =
                        winningAlliance
                });

                imported++;
            }
        }

        await context.SaveChangesAsync(
            cancellationToken);

        _logger.LogInformation(
            "Live sync: {EventName} - " +
            "{Imported} imported, {Updated} updated, " +
            "{Skipped} skipped.",
            eventItem.Name,
            imported,
            updated,
            skipped);
    }

    private static int ParseTeamNumber(
        string teamKey)
    {
        return int.Parse(
            teamKey.Replace("frc", ""));
    }
}