import AppKit
import Darwin
import Foundation
import SwiftUI
import WebKit

@main
struct GrizzlyPlatformMacApp: App {
    @StateObject private var launcher = DashboardLauncher()

    var body: some Scene {
        WindowGroup {
            DashboardWindow(launcher: launcher)
                .frame(minWidth: 900, minHeight: 640)
                .task {
                    if let iconURL = Bundle.main.url(forResource: "GrizzlyPlatform", withExtension: "icns"),
                       let icon = NSImage(contentsOf: iconURL) {
                        NSApplication.shared.applicationIconImage = icon
                    }
                    await launcher.start()
                }
        }
        .defaultSize(width: 1280, height: 860)
    }
}

@MainActor
final class DashboardLauncher: ObservableObject {
    static let defaultAPIBaseURL = "http://10.20.118.4:5263/"
    private static let apiPreferenceKey = "GrizzlyPlatform.APIBaseURL"

    @Published private(set) var dashboardURL: URL?
    @Published private(set) var isStarting = false
    @Published private(set) var errorMessage: String?
    @Published var apiBaseURL: String

    private var webProcess: Process?

    init() {
        apiBaseURL = UserDefaults.standard.string(forKey: Self.apiPreferenceKey)
            ?? Self.defaultAPIBaseURL
    }

    func start() async {
        guard !isStarting, dashboardURL == nil, webProcess?.isRunning != true else {
            return
        }

        isStarting = true
        errorMessage = nil
        defer { isStarting = false }

        do {
            let apiURL = try Self.normalizedAPIBaseURL(apiBaseURL)
            guard let resources = Bundle.main.resourceURL else {
                throw LauncherError.missingResources
            }

            let webDirectory = resources.appendingPathComponent("Web", isDirectory: true)
            let webExecutable = webDirectory.appendingPathComponent("GrizzlyPlatform.Web")
            guard FileManager.default.isExecutableFile(atPath: webExecutable.path) else {
                throw LauncherError.missingWebApplication(webExecutable.path)
            }

            let port = try Self.availableLoopbackPort()
            let address = URL(string: "http://127.0.0.1:\(port)/")!
            let readinessAddress = address.appending(path: "_mac-ready")
            let process = Process()
            process.executableURL = webExecutable
            process.currentDirectoryURL = webDirectory
            process.arguments = [
                "--urls=\(address.absoluteString)",
                "--ApiBaseUrl=\(apiURL)"
            ]
            process.standardOutput = FileHandle.nullDevice
            process.standardError = FileHandle.nullDevice
            process.terminationHandler = { [weak self] terminatedProcess in
                Task { @MainActor [weak self] in
                    guard let self, self.webProcess === terminatedProcess else { return }
                    self.webProcess = nil
                    self.dashboardURL = nil
                    self.errorMessage = "The Grizzly Platform dashboard stopped unexpectedly. You can try starting it again."
                }
            }

            try process.run()
            webProcess = process

            for _ in 0..<80 {
                guard process.isRunning else {
                    throw LauncherError.webApplicationExited
                }

                do {
                    var request = URLRequest(url: readinessAddress)
                    request.timeoutInterval = 1
                    let (_, response) = try await URLSession.shared.data(for: request)
                    if let response = response as? HTTPURLResponse,
                       (200..<400).contains(response.statusCode) {
                        dashboardURL = address
                        UserDefaults.standard.set(apiURL, forKey: Self.apiPreferenceKey)
                        return
                    }
                } catch {
                    // The first requests are expected to fail while ASP.NET starts.
                }

                try await Task.sleep(for: .milliseconds(250))
            }

            throw LauncherError.startupTimedOut
        } catch {
            webProcess?.terminate()
            webProcess = nil
            dashboardURL = nil
            errorMessage = error.localizedDescription
        }
    }

    func reconnect(using newAPIBaseURL: String) async {
        stop()
        apiBaseURL = newAPIBaseURL
        await start()
    }

    func stop() {
        if let webProcess {
            webProcess.terminationHandler = nil
            if webProcess.isRunning {
                webProcess.terminate()
            }
        }
        webProcess = nil
        dashboardURL = nil
    }

    private static func normalizedAPIBaseURL(_ value: String) throws -> String {
        var text = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw LauncherError.invalidAPIAddress }

        if !text.contains("://") {
            text = "http://\(text)"
        }

        guard var components = URLComponents(string: text),
              let scheme = components.scheme?.lowercased(),
              ["http", "https"].contains(scheme),
              components.host != nil,
              components.query == nil,
              components.fragment == nil else {
            throw LauncherError.invalidAPIAddress
        }

        components.scheme = scheme
        var path = components.path
        while path.hasSuffix("/") { path.removeLast() }
        if path.lowercased().hasSuffix("/api") {
            path = String(path.dropLast(4))
        } else if path.lowercased() == "api" {
            path = ""
        }
        components.path = path.isEmpty ? "/" : "\(path)/"

        guard let url = components.url else { throw LauncherError.invalidAPIAddress }
        return url.absoluteString
    }

    private static func availableLoopbackPort() throws -> UInt16 {
        let descriptor = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        guard descriptor >= 0 else { throw LauncherError.couldNotChoosePort }
        defer { Darwin.close(descriptor) }

        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = 0
        address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))

        let bindResult = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(descriptor, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bindResult == 0 else { throw LauncherError.couldNotChoosePort }

        var boundAddress = sockaddr_in()
        var addressLength = socklen_t(MemoryLayout<sockaddr_in>.size)
        let nameResult = withUnsafeMutablePointer(to: &boundAddress) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.getsockname(descriptor, $0, &addressLength)
            }
        }
        guard nameResult == 0 else { throw LauncherError.couldNotChoosePort }
        return UInt16(bigEndian: boundAddress.sin_port)
    }

    private enum LauncherError: LocalizedError {
        case missingResources
        case missingWebApplication(String)
        case invalidAPIAddress
        case couldNotChoosePort
        case webApplicationExited
        case startupTimedOut

        var errorDescription: String? {
            switch self {
            case .missingResources:
                return "The Grizzly Platform app bundle is missing its resources. Rebuild the Mac app and try again."
            case .missingWebApplication(let path):
                return "The bundled dashboard could not be found at \(path). Rebuild the Mac app and try again."
            case .invalidAPIAddress:
                return "Enter a valid API server address, for example http://10.20.118.4:5263/."
            case .couldNotChoosePort:
                return "Grizzly Platform could not reserve a local port for its dashboard. Please try again."
            case .webApplicationExited:
                return "The bundled dashboard quit before it finished starting. Please try again."
            case .startupTimedOut:
                return "The bundled dashboard took too long to start. Please try again."
            }
        }
    }
}

private struct DashboardWindow: View {
    @ObservedObject var launcher: DashboardLauncher
    @State private var showingAPISettings = false

    var body: some View {
        Group {
            if let dashboardURL = launcher.dashboardURL {
                DashboardWebView(url: dashboardURL)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if launcher.isStarting {
                VStack(spacing: 14) {
                    ProgressView()
                    Text("Starting Grizzly Platform…")
                        .font(.headline)
                    Text("Connecting the desktop dashboard to your existing platform server.")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                VStack(spacing: 14) {
                    Image(systemName: "desktopcomputer")
                        .font(.system(size: 42))
                        .foregroundStyle(Color(red: 0.78, green: 0.70, blue: 0.35))
                    Text("Grizzly Platform could not start")
                        .font(.title2.weight(.semibold))
                    Text(launcher.errorMessage ?? "Check the app bundle and try again.")
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: 520)
                    HStack {
                        Button("API Settings…") { showingAPISettings = true }
                        Button("Try Again") { Task { await launcher.start() } }
                            .keyboardShortcut(.defaultAction)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(32)
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .navigationTitle("Grizzly Platform")
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button {
                    showingAPISettings = true
                } label: {
                    Label("API Settings", systemImage: "gearshape")
                }
                .help("Choose the existing Grizzly Platform API server")
            }
        }
        .sheet(isPresented: $showingAPISettings) {
            APISettingsWindow(launcher: launcher)
                .frame(minWidth: 500, minHeight: 250)
        }
        .onDisappear { launcher.stop() }
    }
}

private struct APISettingsWindow: View {
    @ObservedObject var launcher: DashboardLauncher
    @Environment(\.dismiss) private var dismiss
    @State private var editedAPIBaseURL: String

    init(launcher: DashboardLauncher) {
        self.launcher = launcher
        _editedAPIBaseURL = State(initialValue: launcher.apiBaseURL)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Connect to the existing platform server")
                .font(.title3.weight(.semibold))
            Text("The Mac app uses the same API and shared data as the iPad and Android apps. It does not create a local database or start another API server.")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            TextField("API server address", text: $editedAPIBaseURL)
                .textFieldStyle(.roundedBorder)
            Text("Example: http://10.20.118.4:5263/  (an address ending in /api is also accepted)")
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button("Save & Reconnect") {
                    let newValue = editedAPIBaseURL
                    dismiss()
                    Task { await launcher.reconnect(using: newValue) }
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(24)
    }
}

private struct DashboardWebView: NSViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        guard webView.url?.host != url.host || webView.url?.port != url.port else { return }
        webView.load(URLRequest(url: url))
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard navigationAction.navigationType == .linkActivated,
                  let url = navigationAction.request.url,
                  let scheme = url.scheme?.lowercased(),
                  ["http", "https"].contains(scheme),
                  url.host != "127.0.0.1",
                  url.host != "localhost" else {
                decisionHandler(.allow)
                return
            }

            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            guard let url = navigationAction.request.url else { return nil }
            if url.host == "127.0.0.1" || url.host == "localhost" {
                webView.load(navigationAction.request)
            } else {
                NSWorkspace.shared.open(url)
            }
            return nil
        }
    }
}
