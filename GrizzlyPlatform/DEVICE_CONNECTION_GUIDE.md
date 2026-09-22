# Connecting GrizzlyScout tablets to the host

This guide explains every supported connection method. The host computer runs the Grizzly Platform API on TCP port `5263`. The Windows desktop application starts that API automatically.

## Before connecting

1. Start `GrizzlyPlatform.Desktop.exe` on the host.
2. Connect the host and every tablet to the same private Wi-Fi or LAN.
3. When Windows Firewall prompts, allow the application on **Private networks**.
4. Confirm the network allows device-to-device traffic. Guest networks often isolate devices.
5. Open GrizzlyScout on the tablets.

The tablet status bar shows `Searching for host...`, `Connected to host`, or an error message. Tap the status bar to retry discovery.

## Method 1: Automatic UDP discovery (recommended)

The host broadcasts a small discovery beacon on UDP port `5264`. The beacon includes the API port and host name. GrizzlyScout listens for it and saves the host address automatically.

Use this method when:

- The host and tablets are on the same ordinary private Wi-Fi/LAN.
- You want tablets to recover automatically when the host IP changes.

Firewall requirements:

- TCP `5263` for API traffic.
- UDP `5264` for discovery.

No address needs to be entered on the tablet.

## Method 2: mDNS / `.local` discovery

The host also advertises the API as an `_http._tcp` service through mDNS. Android’s native network service discovery can find it without knowing the numeric IP address.

The host name usually looks like:

```text
computer-name.local
```

mDNS requires multicast traffic on the local network. It may be blocked by guest Wi-Fi, VLANs, or enterprise access points. UDP discovery remains available as the fallback.

## Method 3: QR pairing

1. Open the host dashboard.
2. Select **Pair Devices** in the navigation menu.
3. Keep the pairing QR code visible.
4. Scan it with a QR scanner on the tablet.
5. Choose GrizzlyScout when Android asks which app should open the `grizzly://pair` link.
6. The tablet saves the API address and reconnects.

The pairing page also shows the host name, host ID, API address, and `.local` name. The QR image is rendered by QuickChart, so the dashboard computer needs internet access to display the image.

QR pairing is useful when:

- The Wi-Fi blocks broadcast or multicast discovery.
- You want to pair a tablet without typing an address.
- You need to confirm that a tablet is connecting to the correct host.

## Method 4: Manual developer override

This is an emergency fallback for unusual networks.

1. Long-press the version label at the bottom of the navigation drawer.
2. Enter the developer PIN.
3. Enter the host API address, for example:

```text
http://192.168.1.42:5263/api/
```

4. Save the address.

A manual address takes precedence over automatic discovery. To return to automatic discovery, clear the manual setting through the developer screen or reinstall/clear the app data.

## Troubleshooting

### Status stays on “Searching for host...”

- Confirm the desktop app is running.
- Confirm both devices are on the same Wi-Fi/LAN.
- Confirm the network does not use guest isolation.
- Allow TCP `5263` and UDP `5264` through Windows Firewall.
- Tap the status bar to retry.
- Try the QR pairing method.

### Status says “Connected” but syncing fails

- Open the host dashboard and verify the API is running.
- Confirm the tablet can reach the host on TCP `5263`.
- Check that the host IP did not change after switching networks.
- Use the manual override only if discovery is blocked.

### `.local` discovery does not work

- Confirm multicast is enabled on the Wi-Fi network.
- Try UDP discovery first.
- Use QR pairing if the network blocks multicast.

### QR code will not display

- Confirm the host dashboard computer has internet access for the QR image service.
- Use the displayed pairing link with a QR generator on another device.
- Use automatic UDP discovery or the manual override.

## Ports summary

| Purpose | Protocol | Port |
|---|---:|---:|
| Grizzly Platform API | TCP | 5263 |
| Automatic host discovery | UDP | 5264 |
| mDNS service discovery | UDP multicast | 5353 |
| Web dashboard | TCP | 5273 |

## Recommended event setup

Use a private team router or access point with device-to-device communication enabled. Start the host first, then open GrizzlyScout on each tablet. Confirm every tablet shows `Connected to host` before scouting begins. Keep the QR pairing page available as the quickest recovery option.