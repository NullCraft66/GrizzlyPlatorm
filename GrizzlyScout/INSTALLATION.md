# GrizzlyScout — Android Installation Guide

GrizzlyScout is the Android scouting application for Grizzly Robotics. It is designed to send scouting data to the Grizzly Platform API running on the host computer.

## Requirements

- Android phone or tablet running Android 5.1 or newer
- The Grizzly Platform desktop application or API running on the host computer
- A USB connection or a shared private LAN, depending on the configured scouting workflow
- The GrizzlyScout APK file

## Install the APK

1. Copy the APK to the Android device. You can use USB, cloud storage, email, or another file-transfer method.
2. Open the APK on the Android device.
3. If Android blocks the installation, enable permission for the file manager or browser under:
   **Settings → Security/Privacy → Install unknown apps**.
4. Return to the APK and select **Install**.
5. Open **GrizzlyScout** from the app drawer.

Only install APKs from a trusted Grizzly Robotics release folder.

## Connect to the host

1. Start the Grizzly Platform desktop application on the host computer.
2. Connect each Android device to the same private Wi-Fi/LAN.
3. Open GrizzlyScout. It automatically discovers the host, even after the Wi-Fi network or host IP changes.
4. Allow the host API and discovery traffic through Windows Firewall when prompted (API TCP port `5263`, discovery UDP port `5264`).

Guest Wi-Fi networks may prevent devices from communicating with one another. The developer API setting remains available for unusual networks or manual overrides.
## Building a new APK

From the GrizzlyScout project folder, run:

powershell
.\gradlew.bat assembleRelease


The release APK is created at:

text
app\build\outputs\apk\release\app-release-unsigned.apk


For local testing, you can build the debug APK with:

powershell
.\gradlew.bat assembleDebug


The debug APK is created at:

text
app\build\outputs\apk\debug\app-debug.apk


## Updating GrizzlyScout

1. Export or sync any important scouting data first.
2. Install the newer APK over the existing app when Android offers an update.
3. Confirm the tablet rediscovers the host after changing networks.
4. Open the app and test synchronization before using it at an event.

## Troubleshooting

### The APK will not install

- Confirm the device is running Android 5.1 or newer.
- Allow the file manager or browser to install unknown apps.
- Re-copy the APK if the file transfer was interrupted.

### GrizzlyScout cannot sync

- Confirm the desktop/API host is running.
- Confirm the phone and host are on the same network.
- Confirm the host and tablet share a LAN that allows local discovery broadcasts.
- Verify port `5263` is allowed through Windows Firewall.
- Use `http://HOST-IP:5263/api/`, including the final `/api/` path.

### The host changed networks

Find the host's new IPv4 address with `ipconfig`, update `ApiConfig.java`, build a new APK, and reinstall it on the devices.
