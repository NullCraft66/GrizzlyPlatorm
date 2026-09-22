using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;

namespace GrizzlyPlatform.Api.Controllers;

[ApiController]
[Route("api/discovery")]
public sealed class DiscoveryController : ControllerBase
{
    [HttpGet("pairing")]
    public IActionResult Pairing()
    {
        var name = Environment.MachineName.Replace("|", "-");
        var id = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(name)))[..12];
        var address = $"http://{Request.Host.Host}:5263/api/";
        return Ok(new { name, id, address, mdns = $"{name.ToLowerInvariant()}.local", qr = $"grizzly://pair?address={Uri.EscapeDataString(address)}&id={id}" });
    }

    [HttpGet("diagnostics")]
    public IActionResult Diagnostics() => Ok(new { host = Environment.MachineName, api = "online", tcpPort = 5263, discoveryPort = 5264, localNetwork = true });
}