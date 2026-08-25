using Microsoft.AspNetCore.Mvc;

namespace GrizzlyPlatform.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        return Ok(new
        {
            status = "online",
            service = "GrizzlyPlatform"
        });
    }
}