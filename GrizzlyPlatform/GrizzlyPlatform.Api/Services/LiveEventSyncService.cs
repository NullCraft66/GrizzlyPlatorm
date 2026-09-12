using GrizzlyPlatform.Api.Data;
using Microsoft.EntityFrameworkCore;
namespace GrizzlyPlatform.Api.Services;

public class LiveEventSyncService(IServiceScopeFactory scopes, ILogger<LiveEventSyncService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken token)
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(5), token);
            while (!token.IsCancellationRequested)
            {
                try
                {
                    List<int> ids;
                    using (var scope = scopes.CreateScope())
                        ids = await scope.ServiceProvider.GetRequiredService<GrizzlyDbContext>().Events
                            .Where(e => e.BlueAllianceKey != null && e.BlueAllianceKey != "")
                            .Select(e => e.Id).ToListAsync(token);
                    foreach (int id in ids)
                    foreach (string resource in EventSyncService.Resources)
                    {
                        token.ThrowIfCancellationRequested();
                        using var scope = scopes.CreateScope();
                        var result = await scope.ServiceProvider.GetRequiredService<EventSyncService>().SyncAsync(id, resource, token);
                        if (result.Outcome is "Failed" or "Preserved")
                            logger.LogWarning("Event {EventId} {Resource}: {Message}", id, resource, result.Message);
                    }
                }
                catch (OperationCanceledException) when (token.IsCancellationRequested) { break; }
                catch (Exception ex) { logger.LogError(ex, "Event synchronization failed; saved data is retained."); }
                await Task.Delay(TimeSpan.FromSeconds(30), token);
            }
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
    }
}
