using GrizzlyPlatform.Api.Services;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace GrizzlyPlatform.Api.Controllers;

[ApiController, Route("api/nexus/settings")]
public sealed class NexusSettingsController(NexusSettingsStore store, IHttpClientFactory clients) : ControllerBase
{
    [HttpGet] public IActionResult Get() { var s = store.Get(); return Ok(new { s.EventKey, s.Enabled, configured = !string.IsNullOrWhiteSpace(s.ApiKey) }); }
    [HttpGet("events")]
    public async Task<IActionResult> Events()
    {
        var settings = store.Get();
        if (string.IsNullOrWhiteSpace(settings.ApiKey)) return BadRequest("Configure a Nexus API key first.");
        var client = clients.CreateClient("Nexus"); using var request = new HttpRequestMessage(HttpMethod.Get, "events"); request.Headers.TryAddWithoutValidation("Nexus-Api-Key", settings.ApiKey); using var response = await client.SendAsync(request); if (!response.IsSuccessStatusCode) return StatusCode((int)response.StatusCode); using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync()); return Ok(doc.RootElement.Clone());
    }
    [HttpPut] public IActionResult Save(NexusSettings value) { if (value.ApiKey.Length > 500 || value.EventKey.Length > 80) return BadRequest(); store.Save(value); return Ok(new { value.EventKey, value.Enabled, configured = !string.IsNullOrWhiteSpace(value.ApiKey) }); }
}

