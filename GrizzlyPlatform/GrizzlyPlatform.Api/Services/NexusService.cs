using System.Net;
using System.Text.Json;

namespace GrizzlyPlatform.Api.Services;

/// <summary>Server-side client for the official FRC Nexus API.</summary>
public sealed class NexusService(HttpClient httpClient, NexusSettingsStore settingsStore)
{
    public Task<JsonDocument?> GetEventAsync(string eventKey, CancellationToken token = default) =>
        GetAsync($"event/{Uri.EscapeDataString(eventKey)}", token);

    public Task<JsonDocument?> GetPitsAsync(string eventKey, CancellationToken token = default) =>
        GetAsync($"event/{Uri.EscapeDataString(eventKey)}/pits", token);

    public Task<JsonDocument?> GetMapAsync(string eventKey, CancellationToken token = default) =>
        GetAsync($"event/{Uri.EscapeDataString(eventKey)}/map", token);

    public Task<JsonDocument?> GetEventsAsync(CancellationToken token = default) =>
        GetAsync("events", token);

    private async Task<JsonDocument?> GetAsync(string path, CancellationToken token)
    {
        var apiKey = settingsStore.Get().ApiKey;
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new InvalidOperationException("The Nexus API key is not configured.");

        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.TryAddWithoutValidation("Nexus-Api-Key", apiKey);

        using var response = await httpClient.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            token);

        if (response.StatusCode == HttpStatusCode.NotFound)
            return null;

        response.EnsureSuccessStatusCode();

        await using var content = await response.Content.ReadAsStreamAsync(token);
        return await JsonDocument.ParseAsync(content, cancellationToken: token);
    }
}
