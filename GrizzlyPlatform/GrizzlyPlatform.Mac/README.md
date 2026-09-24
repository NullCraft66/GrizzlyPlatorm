# Grizzly Platform for Mac

This is a native macOS window around the existing Grizzly Platform Blazor web client. It keeps the existing dashboard, pages, and API-backed actions; the web client calls the same API server used by the iPad and Android apps. The Mac app does not start `GrizzlyPlatform.Api`, create a local database, or make substitute data.

The initial API address matches the mobile apps' current default (`http://10.20.118.4:5263/`). Change it from the app's **API Settings** toolbar button if the school's server has a different address. The entered address is saved on this Mac. The Mac must be on a network that can reach that API server for live events, login, scouting, and other server-backed features to work.

## Running the app

Open `~/Applications/Grizzly Platform.app`. The published web client and .NET runtime are embedded in the app bundle, so the Mac user does not need to install .NET. The bundle listens only on a temporary loopback port for its own embedded browser window; it does not expose a second LAN API.

## Rebuilding from source

On a Mac, install Xcode Command Line Tools and the .NET 10 SDK, then run:

```sh
./build-app.sh
```

The script builds for the architecture of the Mac doing the build (`osx-arm64` or `osx-x64`), self-contained-publishes the existing web project, and writes the app to `~/Applications/Grizzly Platform.app`. It refuses to overwrite an existing app bundle; pass a different output path as the first argument to keep a prior build.

This locally ad-hoc-signed app is suitable for development/testing on the Mac where it was built. Distribution to other Macs requires the appropriate Apple Developer signing and notarization.
