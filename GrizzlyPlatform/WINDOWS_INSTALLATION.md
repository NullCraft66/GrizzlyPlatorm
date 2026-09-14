# Grizzly Robotics Platform — Windows Installation

## Download

From the repository's **Releases** page, download the latest `GrizzlyRoboticsPlatform-win-x64` package and extract the complete folder.

Keep `GrizzlyPlatform.Desktop.exe`, the `Api` folder, the `Web` folder, and `appsettings.json` together.

## Install and run

1. Double-click `GrizzlyPlatform.Desktop.exe`.
2. Allow access on **Private networks** if Windows Firewall asks.
3. The desktop app starts the API and web dashboard automatically.

The local dashboard address is `http://127.0.0.1:5273`.

## Connect Android scouting devices

On the host computer, run:

```powershell
ipconfig
```

Use the active adapter's IPv4 address from the Android setup guide. Devices must be on the same private Wi-Fi/LAN.

The web dashboard uses port `5273`. The API uses port `5263`.

## Changing networks

The app normally does not need reconfiguration. Find the host's new IPv4 address with `ipconfig` and update the Android app if the address changed.

See [GrizzlyScout/INSTALLATION.md](../GrizzlyScout/INSTALLATION.md) for Android installation and connection instructions.
