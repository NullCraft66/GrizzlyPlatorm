using GrizzlyPlatform.Api.Services;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace GrizzlyPlatform.Api.Controllers;

[ApiController]
[Route("api/nexus")]
public sealed class NexusController(NexusService nexus, NexusSettingsStore store) : ControllerBase
{
    [HttpGet("status")]
    public IActionResult Status() => Ok(new { configured = !string.IsNullOrWhiteSpace(store.Get().ApiKey) });
    [HttpGet("event/{eventKey}")]
    public Task<IActionResult> Event(string eventKey, CancellationToken token) => Proxy(eventKey, () => nexus.GetEventAsync(eventKey, token));
    [HttpGet("event/{eventKey}/pits")]
    public async Task<IActionResult> Pits(string eventKey, CancellationToken token)
    {
        var settings = store.Get();
        if (string.IsNullOrWhiteSpace(settings.ApiKey)) return StatusCode(503, new { message = "Nexus is not configured on the host." });
        if (string.IsNullOrWhiteSpace(eventKey) || eventKey.Length > 80) return BadRequest("Invalid Nexus event key.");
        try
        {
            var doc = await nexus.GetPitsAsync(eventKey, token);
            return doc is null ? Ok(new { available = false, pits = new { } }) : Content(doc.RootElement.GetRawText(), "application/json");
        }
        catch (HttpRequestException) { return Ok(new { available = false, pits = new { } });
        }
    }
    [HttpGet("event/{eventKey}/map")]
    public Task<IActionResult> Map(string eventKey, CancellationToken token) => Proxy(eventKey, () => nexus.GetMapAsync(eventKey, token));
    [HttpGet("snapshot")]
    public async Task<IActionResult> Snapshot(CancellationToken token)
    {
        var settings = store.Get(); if (!settings.Enabled || string.IsNullOrWhiteSpace(settings.ApiKey) || string.IsNullOrWhiteSpace(settings.EventKey)) return Ok(new { eventKey = settings.EventKey, connected = false, matches = Array.Empty<object>(), pits = new { }, map = new { } });
        try {
            var eventDoc = await nexus.GetEventAsync(settings.EventKey, token); JsonDocument? pits = null; JsonDocument? map = null;
            try { pits = await nexus.GetPitsAsync(settings.EventKey, token); } catch (HttpRequestException) { }
            try { map = await nexus.GetMapAsync(settings.EventKey, token); } catch (HttpRequestException) { }
            var root = eventDoc?.RootElement.Clone() ?? JsonDocument.Parse("{}").RootElement.Clone();
            var matches = root.ValueKind == JsonValueKind.Object && root.TryGetProperty("matches", out var m) ? m.Clone() : JsonDocument.Parse("[]").RootElement.Clone();
            return Ok(new { eventKey = settings.EventKey, connected = eventDoc is not null, refreshedAt = DateTimeOffset.UtcNow, status = root, matches, pits = pits?.RootElement.Clone() ?? JsonDocument.Parse("{}").RootElement.Clone(), map = map?.RootElement.Clone() ?? JsonDocument.Parse("{}").RootElement.Clone() });
        } catch (HttpRequestException ex) { return StatusCode(502, new { message = "Nexus request failed.", detail = ex.Message }); }
    }
    private async Task<IActionResult> Proxy(string key, Func<Task<JsonDocument?>> fetch)
    {
        if (string.IsNullOrWhiteSpace(store.Get().ApiKey)) return StatusCode(503, new { message = "Nexus is not configured on the host." });
        if (string.IsNullOrWhiteSpace(key) || key.Length > 80) return BadRequest("Invalid Nexus event key.");
        try { var doc = await fetch(); return doc is null ? StatusCode(503) : Content(doc.RootElement.GetRawText(), "application/json"); }
        catch (HttpRequestException ex) { return StatusCode(502, new { message = "Nexus request failed.", detail = ex.Message }); }
    }
}




