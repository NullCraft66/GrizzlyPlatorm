using System.Net;
using System.Net.NetworkInformation;
using Makaretu.Dns;

namespace GrizzlyPlatform.Api.Services;

public sealed class MdnsAdvertisementService(ILogger<MdnsAdvertisementService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        MulticastService? multicast = null;
        try
        {
            var host = Environment.MachineName.ToLowerInvariant().Replace(" ", "-");
            var addresses = NetworkInterface.GetAllNetworkInterfaces().Where(n => n.OperationalStatus == OperationalStatus.Up)
                .SelectMany(n => n.GetIPProperties().UnicastAddresses).Select(a => a.Address)
                .Where(a => a.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork).ToArray();
            multicast = new MulticastService();
            multicast.Start();
            var discovery = new ServiceDiscovery(multicast);
            var profile = new ServiceProfile("GrizzlyScout", "_http._tcp", 5263, addresses);
            profile.HostName = new DomainName(host + ".local");
            discovery.Advertise(profile);
            logger.LogInformation("Advertising GrizzlyScout API as {Host}.local", host);
            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
        catch (Exception ex) { logger.LogWarning(ex, "mDNS advertisement unavailable; UDP discovery remains active"); }
        finally { multicast?.Dispose(); }
    }
}