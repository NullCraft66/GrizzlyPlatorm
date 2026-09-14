# Grizzly Robotics Platform — Windows Installation Guide

## Requirements

- Windows 10 or Windows 11, 64-bit
- A Windows account with permission to run applications
- For mobile access: all devices must be on the same private Wi-Fi/LAN
- Microsoft Edge WebView2 Runtime installed on the host computer

## Install

1. Copy the entire `GrizzlyRoboticsPlatform-win-x64` folder to the host computer.
2. Keep the folder together. Do not move or delete the `Api` or `Web` folders.
3. Double-click `GrizzlyPlatform.Desktop.exe`.
4. If Windows Firewall asks for permission, allow access on **Private networks**.

The desktop app starts the API and web services automatically. No separate API or web command is required.

## Open the app on the host computer

The desktop window opens automatically. If needed, the local web address is:

```text
http://127.0.0.1:5273
```

## Connect mobile devices

1. On the host computer, open PowerShell and run:

   ```powershell
   ipconfig
   ```

2. Find the active adapter's `IPv4 Address`, for example `192.168.1.42`.
3. On the mobile device, open a browser and visit:

   ```text
   http://192.168.1.42:5273
   ```

   Replace the example IP with the host computer's current IP address.

Both devices must be connected to the same Wi-Fi/LAN. Guest Wi-Fi networks may block device-to-device access.

## Changing networks

The app normally needs no configuration change. When the host joins a different network, run `ipconfig` again and use the new IPv4 address on the mobile devices.

If the connection fails:

- Set the Windows network profile to **Private**.
- Confirm the desktop app is running.
- Confirm the mobile device is on the same network.
- Make sure Windows Firewall allows ports `5273` and `5263` on Private networks.

## Configuration

Settings are stored in `appsettings.json` beside `GrizzlyPlatform.Desktop.exe`:

```json
{
  "ApiUrl": "http://0.0.0.0:5263",
  "ApiBrowserUrl": "http://127.0.0.1:5263",
  "WebUrl": "http://127.0.0.1:5273",
  "WebListenUrl": "http://0.0.0.0:5273",
  "DatabasePath": "grizzlyplatform.db"
}
```

The default database is created in the API folder. To use another location, change `DatabasePath` to a full path, for example:

```json
"DatabasePath": "D:\\GrizzlyData\\grizzlyplatform.db"
```

Restart the desktop app after changing settings.

## Updating the application

1. Close the desktop app.
2. Back up the database file before replacing the application folder.
3. Replace the old application files with the new package.
4. Restore the database file if the new package does not already contain it.
5. Start `GrizzlyPlatform.Desktop.exe` again.

## Troubleshooting

### The app does not start

- Confirm all files and folders were copied together.
- Install or repair the Microsoft Edge WebView2 Runtime.
- Start the app again after allowing it through Windows Firewall.

### A phone cannot connect

- Use the host computer's current IPv4 address, not `localhost` or `127.0.0.1`.
- Include port `5273` in the address.
- Confirm both devices are on the same private network.
- Check that ports `5273` and `5263` are allowed through Windows Firewall.

### Data is missing

- Check that `DatabasePath` points to the expected database file.
- Do not place the database inside a temporary or cloud-synced folder while the app is running.
- Close the app before copying or backing up the database.
