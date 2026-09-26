using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;

namespace GrizzlyPlatform.Api.Controllers;

[ApiController]
[Route("api/discovery")]
public sealed class DiscoveryController(IConfiguration configuration) : ControllerBase
{
    [HttpGet("pairing")]
    public IActionResult Pairing()
    {
        var localNetwork = LocalNetworkEnabled;
        var address = GetApiAddress();
        var name = configuration["PublicHostName"] ??
            (localNetwork ? Environment.MachineName.Replace("|", "-") : "GrizzlyPlatform");
        var identity = localNetwork ? Environment.MachineName : address.TrimEnd('/');
        var id = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity)))[..12];
        var mdns = localNetwork ? $"{name.ToLowerInvariant()}.local" : "";
        var qr = $"grizzly://pair?address={Uri.EscapeDataString(address)}&id={id}";

        return Ok(new { name, id, address, mdns, qr, localNetwork });
    }

    [HttpGet("diagnostics")]
    public IActionResult Diagnostics()
    {
        var localNetwork = LocalNetworkEnabled;
        return Ok(new
        {
            host = configuration["PublicHostName"] ??
                (localNetwork ? Environment.MachineName : "GrizzlyPlatform"),
            api = "online",
            tcpPort = localNetwork ? 5263 : 443,
            discoveryPort = localNetwork ? 5264 : (int?)null,
            localNetwork
        });
    }

    private bool LocalNetworkEnabled => configuration.GetValue("LocalNetwork:Enabled", true);

    private string GetApiAddress()
    {
        var configuredBaseUrl = configuration["PublicApiBaseUrl"];
        if (string.IsNullOrWhiteSpace(configuredBaseUrl))
        {
            if (!LocalNetworkEnabled)
                throw new InvalidOperationException(
                    "PublicApiBaseUrl must be configured when LocalNetwork:Enabled is false.");

            return $"{Request.Scheme}://{Request.Host}/api/";
        }

        if (!Uri.TryCreate(configuredBaseUrl.Trim(), UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            throw new InvalidOperationException(
                "PublicApiBaseUrl must be an absolute HTTP or HTTPS URL.");

        var path = uri.AbsolutePath.TrimEnd('/');
        if (!path.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
            path += "/api";

        return new UriBuilder(uri)
        {
            Path = path + "/",
            Query = "",
            Fragment = ""
        }.Uri.AbsoluteUri;
    }
}
