using GrizzlyPlatform.Api.Models;
using GrizzlyPlatform.Api.Services;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace GrizzlyPlatform.Api.Controllers;

[ApiController, Route("api/nexus/settings")]
public sealed class NexusSettingsController(NexusSettingsStore store, NexusService nexus) : ControllerBase
{
    [HttpGet] public IActionResult Get() { var s = store.Get(); return Ok(new { s.EventKey, s.Enabled, configured = !string.IsNullOrWhiteSpace(s.ApiKey) }); }
    [HttpGet("events")]
    public async Task<IActionResult> Events()
    {
        var settings = store.Get();
        if (string.IsNullOrWhiteSpace(settings.ApiKey))
            return BadRequest("Configure a Nexus API key first.");

        using var document = await nexus.GetEventsAsync();
        if (document is null)
            return NotFound();
        return Ok(document.RootElement.Clone());
    }

    [HttpPut]
    public IActionResult Save(NexusSettings value)
    {
        if (value is null || value.ApiKey is null || value.EventKey is null ||
            value.ApiKey.Length > 500 || value.EventKey.Length > 80)
            return BadRequest();

        value.EventKey = value.EventKey.Trim();
        store.Save(value);
        var configured = !string.IsNullOrWhiteSpace(store.Get().ApiKey);
        return Ok(new
        {
            value.EventKey,
            value.Enabled,
            configured
        });
    }
}
