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

    public ActiveScoutingConfigurationController(
        GrizzlyDbContext context)
    {
        _context = context;
    }

    // GET: api/ActiveScoutingConfiguration
    [HttpGet]
    public async Task<IActionResult> GetConfiguration()
    {
        var configuration =
            await _context.ActiveScoutingConfigurations
                .FirstOrDefaultAsync();

        if (configuration == null)
        {
            return Ok(new
            {
                activePitFormId = (int?)null,
                activeMatchFormId = (int?)null
            });
        }

        return Ok(new
        {
            activePitFormId =
                configuration.ActivePitFormId,

            activeMatchFormId =
                configuration.ActiveMatchFormId
        });
    }

    // PUT: api/ActiveScoutingConfiguration
    [HttpPut]
    public async Task<IActionResult> UpdateConfiguration(
        ActiveScoutingConfiguration request)
    {
        if (request.ActivePitFormId.HasValue)
        {
            var pitForm =
                await _context.GameForms.FindAsync(
                    request.ActivePitFormId.Value
                );

            if (pitForm == null)
            {
                return BadRequest(
                    "The selected pit form does not exist."
                );
            }

            if (pitForm.FormType != GameFormType.Pit)
            {
                return BadRequest(
                    "The selected pit form is not a Pit form."
                );
            }
        }

        if (request.ActiveMatchFormId.HasValue)
        {
            var matchForm =
                await _context.GameForms.FindAsync(
                    request.ActiveMatchFormId.Value
                );

            if (matchForm == null)
            {
                return BadRequest(
                    "The selected match form does not exist."
                );
            }

            if (matchForm.FormType != GameFormType.Match)
            {
                return BadRequest(
                    "The selected match form is not a Match form."
                );
            }
        }

        var configuration =
            await _context.ActiveScoutingConfigurations
                .FirstOrDefaultAsync();

        if (configuration == null)
        {
            configuration =
                new ActiveScoutingConfiguration();

            _context.ActiveScoutingConfigurations.Add(
                configuration
            );
        }

        configuration.ActivePitFormId =
            request.ActivePitFormId;

        configuration.ActiveMatchFormId =
            request.ActiveMatchFormId;

        await _context.SaveChangesAsync();

        return Ok(new
        {
            activePitFormId =
                configuration.ActivePitFormId,

            activeMatchFormId =
                configuration.ActiveMatchFormId
        });
    }
}