using GrizzlyPlatform.Api.Data;
using GrizzlyPlatform.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GrizzlyPlatform.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ActiveScoutingConfigurationController : ControllerBase
{
    private readonly GrizzlyDbContext _context;

    public ActiveScoutingConfigurationController(GrizzlyDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetConfiguration()
    {
        var configuration = await _context.ActiveScoutingConfigurations
            .AsNoTracking().FirstOrDefaultAsync();
        return Ok(configuration ?? new ActiveScoutingConfiguration());
    }

    // Existing Game Forms clients update forms without clearing device defaults.
    [HttpPut]
    public Task<IActionResult> UpdateConfiguration(ActiveScoutingConfiguration request)
    {
        return SaveConfiguration(request, updateDeviceDefaults: false);
    }

    [HttpPut("devices")]
    public Task<IActionResult> UpdateDeviceConfiguration(ActiveScoutingConfiguration request)
    {
        return SaveConfiguration(request, updateDeviceDefaults: true);
    }

    private async Task<IActionResult> SaveConfiguration(
        ActiveScoutingConfiguration request, bool updateDeviceDefaults)
    {
        var configuration = await _context.ActiveScoutingConfigurations
            .FirstOrDefaultAsync();
        int? seasonId = updateDeviceDefaults
            ? request.ActiveSeasonId : configuration?.ActiveSeasonId;
        int? eventId = updateDeviceDefaults
            ? request.ActiveEventId : configuration?.ActiveEventId;

        if (eventId.HasValue && !seasonId.HasValue)
            return BadRequest("Select a season for the active event.");

        if (seasonId.HasValue &&
            !await _context.Seasons.AnyAsync(s => s.Id == seasonId.Value))
            return BadRequest("The selected season does not exist.");

        if (eventId.HasValue &&
            !await _context.Events.AnyAsync(e =>
                e.Id == eventId.Value && e.SeasonId == seasonId))
            return BadRequest("The selected event does not belong to the selected season.");

        foreach (var (formId, formType) in new[]
        {
            (request.ActivePitFormId, GameFormType.Pit),
            (request.ActiveMatchFormId, GameFormType.Match)
        })
        {
            if (!formId.HasValue)
                continue;

            var form = await _context.GameForms.FindAsync(formId.Value);
            if (form == null || form.FormType != formType)
                return BadRequest($"Select a valid {formType} form.");
            if (seasonId.HasValue && form.SeasonId != seasonId.Value)
                return BadRequest($"The {formType} form must belong to the active season. Update Device Configuration first.");
        }

        if (configuration == null)
        {
            configuration = new ActiveScoutingConfiguration();
            _context.ActiveScoutingConfigurations.Add(configuration);
        }

        configuration.ActivePitFormId = request.ActivePitFormId;
        configuration.ActiveMatchFormId = request.ActiveMatchFormId;
        if (updateDeviceDefaults)
        {
            configuration.ActiveSeasonId = seasonId;
            configuration.ActiveEventId = eventId;
        }

        await _context.SaveChangesAsync();
        return Ok(configuration);
    }
}
