using System.Text.Json;

namespace GrizzlyPlatform.Api.Services;

public class TheBlueAllianceService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;

    public TheBlueAllianceService(
        HttpClient httpClient,
        IConfiguration configuration)
    {
        _httpClient = httpClient;
        _configuration = configuration;
    }

    public async Task<JsonElement> GetEventTeamsAsync(string eventKey)
    {
        var apiKey = _configuration["TheBlueAlliance:ApiKey"];

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException(
                "The Blue Alliance API key is not configured.");
        }

        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"event/{eventKey}/teams");

        request.Headers.Add("X-TBA-Auth-Key", apiKey);

        var response = await _httpClient.SendAsync(request);

        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync();

        using var document = JsonDocument.Parse(json);

        return document.RootElement.Clone();
    }

    public async Task<JsonElement> GetEventMatchesAsync(string eventKey)
    {
        var apiKey = _configuration["TheBlueAlliance:ApiKey"];

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException(
                "The Blue Alliance API key is not configured.");
        }

        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"event/{eventKey}/matches");

        request.Headers.Add("X-TBA-Auth-Key", apiKey);

        var response = await _httpClient.SendAsync(request);

        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync();

        using var document = JsonDocument.Parse(json);

        return document.RootElement.Clone();
    }
}