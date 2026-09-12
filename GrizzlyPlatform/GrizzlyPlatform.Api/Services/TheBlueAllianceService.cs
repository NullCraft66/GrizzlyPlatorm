using System.Text.Json;
namespace GrizzlyPlatform.Api.Services;

public class TheBlueAllianceService(HttpClient httpClient, IConfiguration configuration)
{
    public Task<JsonElement> GetEventTeamsAsync(string key, CancellationToken token = default) =>
        GetAsync(key, "teams", token);
    public Task<JsonElement> GetEventMatchesAsync(string key, CancellationToken token = default) =>
        GetAsync(key, "matches", token);
    public Task<JsonElement> GetEventRankingsAsync(string key, CancellationToken token = default) =>
        GetAsync(key, "rankings", token);

    private async Task<JsonElement> GetAsync(string key, string resource, CancellationToken token)
    {
        var apiKey = configuration["TheBlueAlliance:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new InvalidOperationException("The Blue Alliance API key is not configured.");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(15));
        using var request = new HttpRequestMessage(HttpMethod.Get, $"event/{Uri.EscapeDataString(key)}/{resource}");
        request.Headers.Add("X-TBA-Auth-Key", apiKey);
        using var response = await httpClient.SendAsync(request, timeout.Token);
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync(timeout.Token);
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }
}
