using System.Net;
using System.Net.Sockets;
using System.Net.NetworkInformation;
using System.Text;

namespace GrizzlyPlatform.Api.Services;

/// <summary>Broadcasts the API endpoint to scouting tablets on the local network.</summary>
public sealed class HostDiscoveryService(ILogger<HostDiscoveryService> logger) : BackgroundService
{
    public const int DiscoveryPort = 5264;
    private const string BeaconPrefix = "GRIZZLY_SCOUT_API|1|5263|";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            using var socket = new UdpClient { EnableBroadcast = true };
            var hostName = Environment.MachineName.Replace("|", "-");
var payload = Encoding.UTF8.GetBytes(BeaconPrefix + hostName);
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    foreach (var target in GetBroadcastAddresses())
                    {
                        await socket.SendAsync(payload, new IPEndPoint(target, DiscoveryPort), stoppingToken);
                    }
                }
                catch (SocketException ex)
                {
                    logger.LogDebug(ex, "Unable to broadcast the scouting API discovery beacon");
                }
                await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Scouting API network discovery could not start");
        }
    }
    private static IEnumerable<IPAddress> GetBroadcastAddresses()
    {
        foreach (var network in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (network.OperationalStatus != OperationalStatus.Up) continue;
            foreach (var address in network.GetIPProperties().UnicastAddresses)
            {
                if (address.Address.AddressFamily != AddressFamily.InterNetwork || address.IPv4Mask is null) continue;
                var ip = address.Address.GetAddressBytes();
                var mask = address.IPv4Mask.GetAddressBytes();
                var broadcast = new byte[4];
                for (var i = 0; i < broadcast.Length; i++) broadcast[i] = (byte)(ip[i] | (mask[i] ^ 255));
                yield return new IPAddress(broadcast);
            }
        }
        yield return IPAddress.Broadcast;
    }}
