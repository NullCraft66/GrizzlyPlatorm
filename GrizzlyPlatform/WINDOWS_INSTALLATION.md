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

1. Connect the host and tablets to the same private Wi-Fi/LAN.
2. Allow the Grizzly Platform API through Windows Firewall on TCP port `5263` and discovery beacons on UDP port `5264`.
3. Open GrizzlyScout on each tablet. It discovers the host automatically, including after network changes.

Guest Wi-Fi networks may block device-to-device broadcasts. The Android developer API setting can be used as a manual fallback on networks that disable broadcast traffic.
See [GrizzlyScout/INSTALLATION.md](../GrizzlyScout/INSTALLATION.md) for Android installation and connection instructions.
