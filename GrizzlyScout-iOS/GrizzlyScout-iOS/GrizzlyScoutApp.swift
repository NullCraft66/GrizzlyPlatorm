import Foundation
import SwiftUI
import UIKit

// This target mirrors the Android GrizzlyScout client. The screen flow and
// payloads below intentionally follow the existing Java fragments and the
// GameFormSubmissions API rather than using hard-coded demo data.

@main
struct GrizzlyScoutApp: App {
    @StateObject private var settings = AppSettings()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(settings)
        }
    }
}

final class AppSettings: ObservableObject {
    static let defaultBaseURL = "http://10.20.118.4:5263/api/"

    @Published var baseURL: String {
        didSet { UserDefaults.standard.set(baseURL, forKey: "api_base_url") }
    }

    @Published var scoutName: String {
        didSet { UserDefaults.standard.set(scoutName, forKey: "scout_name") }
    }

    init() {
        baseURL = UserDefaults.standard.string(forKey: "api_base_url") ?? Self.defaultBaseURL
        scoutName = UserDefaults.standard.string(forKey: "scout_name") ?? ""
    }

    var normalizedBaseURL: URL? {
        var value = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if !value.hasSuffix("/") { value += "/" }
        if !value.lowercased().hasSuffix("api/") { value += "api/" }
        return URL(string: value)
    }
}

enum APIError: LocalizedError {
    case invalidBaseURL
    case server(String)
    case emptyResponse

    var errorDescription: String? {
        switch self {
        case .invalidBaseURL: return "The API address is not valid."
        case .server(let message): return message
        case .emptyResponse: return "The server returned an empty response."
        }
    }
}

struct FlexibleInt: Codable, Hashable {
    let value: Int

    init(_ value: Int = 0) { self.value = value }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let integer = try? container.decode(Int.self) {
            value = integer
        } else if let string = try? container.decode(String.self) {
            if string.lowercased() == "match" { value = 1 }
            else if let integer = Int(string) { value = integer }
            else { value = 0 }
        } else {
            value = 0
        }
    }

    func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(value) }
}

struct ActiveConfiguration: Codable {
    var activePitFormId: Int?
    var activeMatchFormId: Int?
    var activeSeasonId: Int?
    var activeEventId: Int?
}

struct Event: Codable, Identifiable, Hashable {
    let id: Int
    let seasonId: Int
    let name: String
    let location: String
    let eventType: String
    let startDate: String?
    let endDate: String?
}

struct GameForm: Codable, Identifiable {
    let id: Int
    let seasonId: Int
    let name: String
    let description: String
    let formType: FlexibleInt
    let fields: [GameFormField]

    var isMatch: Bool { formType.value == 1 }
}

struct GameFormField: Codable, Identifiable {
    let id: Int
    let question: String
    let description: String
    let fieldType: FlexibleInt
    let required: Bool
    let displayOrder: Int
    let isSystemField: Bool
    let isAllianceSelectionFilter: Bool
    let options: [GameFormFieldOption]

    var type: Int { fieldType.value }
}

struct GameFormFieldOption: Codable, Identifiable, Hashable {
    let id: Int
    let value: String
    let displayOrder: Int
}

struct MatchTeam: Codable, Hashable, Identifiable {
    let id: Int
    let teamNumber: Int
    let name: String
}

struct Match: Codable, Identifiable, Hashable {
    let id: Int
    let eventId: Int
    let matchType: String
    let matchNumber: Int
    let setNumber: Int
    let redTeam1: MatchTeam?
    let redTeam2: MatchTeam?
    let redTeam3: MatchTeam?
    let blueTeam1: MatchTeam?
    let blueTeam2: MatchTeam?
    let blueTeam3: MatchTeam?

    var title: String {
        let set = setNumber > 0 ? " Set \(setNumber)" : ""
        return "\(matchType) \(matchNumber)\(set)"
    }

    var redTeams: [MatchTeam] { [redTeam1, redTeam2, redTeam3].compactMap { $0 } }
    var blueTeams: [MatchTeam] { [blueTeam1, blueTeam2, blueTeam3].compactMap { $0 } }
    var teams: [MatchTeam] { redTeams + blueTeams }
}

struct SubmissionAnswer: Decodable, Identifiable {
    let fieldId: Int
    let question: String?
    var value: String
    var id: Int { fieldId }

    enum CodingKeys: String, CodingKey { case fieldId, gameFormFieldId, question, value }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        fieldId = try container.decodeIfPresent(Int.self, forKey: .fieldId) ?? container.decode(Int.self, forKey: .gameFormFieldId)
        question = try container.decodeIfPresent(String.self, forKey: .question)
        value = try container.decodeIfPresent(String.self, forKey: .value) ?? ""
    }

    init(fieldId: Int, question: String? = nil, value: String) { self.fieldId = fieldId; self.question = question; self.value = value }
}

struct Submission: Decodable, Identifiable {
    let id: Int
    let gameFormId: Int
    let gameFormName: String?
    let formType: String?
    let eventId: Int?
    let matchId: Int?
    let matchNumber: Int?
    let teamId: Int?
    let teamNumber: Int?
    let teamName: String?
    let submittedAt: String?
    var answers: [SubmissionAnswer]
}

struct ScoutAnswer: Codable {
    let gameFormFieldId: Int
    let value: String
}

struct ScoutSubmissionRequest: Codable {
    let gameFormId: Int
    let teamNumber: Int
    let scoutName: String
    let eventId: Int?
    let matchType: String?
    let matchNumber: Int?
    let setNumber: Int?
    let answers: [ScoutAnswer]
}

struct UpdateSubmissionRequest: Codable { let answers: [ScoutAnswer] }

struct EventSelection { let events: [Event]; let preset: Bool }

struct AlliancePlanResponse: Decodable {
    let eventId: Int
    let eventName: String
    let seasonId: Int
    let version: Int64
    let ourTeamId: Int?
    let firstPartnerId: Int?
    let secondPartnerId: Int?
    let notes: String
    let updatedAt: String?
    let wishlist: [AllianceWishlistEntry]
    let teams: [AlliancePlanTeam]
    var suggestions: [AlliancePlanSuggestion]

    enum CodingKeys: String, CodingKey {
        case eventId, eventName, seasonId, version, ourTeamId, firstPartnerId, secondPartnerId
        case notes, updatedAt, wishlist, teams, suggestions
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        eventId = try container.decode(Int.self, forKey: .eventId)
        eventName = try container.decode(String.self, forKey: .eventName)
        seasonId = try container.decodeIfPresent(Int.self, forKey: .seasonId) ?? 0
        version = try container.decodeIfPresent(Int64.self, forKey: .version) ?? 0
        ourTeamId = try container.decodeIfPresent(Int.self, forKey: .ourTeamId)
        firstPartnerId = try container.decodeIfPresent(Int.self, forKey: .firstPartnerId)
        secondPartnerId = try container.decodeIfPresent(Int.self, forKey: .secondPartnerId)
        notes = try container.decodeIfPresent(String.self, forKey: .notes) ?? ""
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt)
        wishlist = try container.decodeIfPresent([AllianceWishlistEntry].self, forKey: .wishlist) ?? []
        teams = try container.decodeIfPresent([AlliancePlanTeam].self, forKey: .teams) ?? []
        suggestions = try container.decodeIfPresent([AlliancePlanSuggestion].self, forKey: .suggestions) ?? []
    }
}

struct AlliancePlanTeam: Decodable, Identifiable {
    let teamId: Int
    let teamNumber: Int
    let teamName: String
    var id: Int { teamId }
    var displayName: String { "\(teamNumber) - \(teamName)" }
}

struct AlliancePlanSuggestion: Decodable, Identifiable {
    let id: UUID
    let eventId: Int
    let teamId: Int
    let author: String
    let reason: String
    let status: String
    let hostResponse: String
    let createdAt: String
    let reviewedAt: String?
}

struct AllianceSuggestionRequest: Encodable {
    let id: UUID
    let teamId: Int
    let author: String
    let reason: String
}

struct AllianceWishlistEntry: Decodable, Identifiable {
    let teamId: Int
    let position: Int
    let reason: String
    var id: Int { teamId }
}

final class APIClient {
    let settings: AppSettings
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(settings: AppSettings) { self.settings = settings }

    private func request(_ method: String, _ endpoint: String, body: Data? = nil) async throws -> Data {
        guard let base = settings.normalizedBaseURL else { throw APIError.invalidBaseURL }
        guard let url = URL(string: endpoint, relativeTo: base) else { throw APIError.invalidBaseURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 10
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.server("The API returned an invalid response.") }
        guard (200..<300).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw APIError.server("API error \(http.statusCode): \(message)")
        }
        return data
    }

    func get<T: Decodable>(_ endpoint: String, as type: T.Type) async throws -> T {
        let data = try await request("GET", endpoint)
        guard !data.isEmpty else { throw APIError.emptyResponse }
        do { return try decoder.decode(T.self, from: data) }
        catch { throw APIError.server("Could not read \(endpoint): \(error.localizedDescription)") }
    }

    func send<T: Encodable, R: Decodable>(_ method: String, _ endpoint: String, body: T, as type: R.Type) async throws -> R {
        let response = try await request(method, endpoint, body: encoder.encode(body))
        guard !response.isEmpty else { throw APIError.emptyResponse }
        return try decoder.decode(R.self, from: response)
    }

    func activeConfiguration() async throws -> ActiveConfiguration { try await get("ActiveScoutingConfiguration", as: ActiveConfiguration.self) }
    func form(_ id: Int) async throws -> GameForm { try await get("GameForms/\(id)", as: GameForm.self) }
    func events() async throws -> [Event] { try await get("Events", as: [Event].self) }
    func matches(eventId: Int) async throws -> [Match] { try await get("Matches/event/\(eventId)", as: [Match].self) }
    func submissions() async throws -> [Submission] { try await get("GameFormSubmissions", as: [Submission].self) }
    func submission(id: Int) async throws -> Submission { try await get("GameFormSubmissions/\(id)", as: Submission.self) }
    func alliancePlan(eventId: Int) async throws -> AlliancePlanResponse { try await get("AlliancePlans/event/\(eventId)", as: AlliancePlanResponse.self) }
    func suggestAllianceTeam(eventId: Int, request: AllianceSuggestionRequest) async throws -> AlliancePlanSuggestion {
        try await send("POST", "AlliancePlans/event/\(eventId)/suggestions", body: request, as: AlliancePlanSuggestion.self)
    }

    func eventSelection(formId: Int) async throws -> EventSelection {
        async let configuration = activeConfiguration()
        async let form = form(formId)
        async let allEvents = events()
        let (configurationValue, formValue, eventsValue) = try await (configuration, form, allEvents)
        if let activeSeasonId = configurationValue.activeSeasonId, activeSeasonId > 0, activeSeasonId != formValue.seasonId {
            throw APIError.server("This form is not in the active season. Reopen scouting to load the current form.")
        }
        let matching = eventsValue.filter { $0.seasonId == formValue.seasonId && (configurationValue.activeEventId == nil || $0.id == configurationValue.activeEventId) }
        if configurationValue.activeEventId != nil && matching.isEmpty { throw APIError.server("The active event is unavailable for this form. Check Device Configuration on the site.") }
        return EventSelection(events: matching, preset: configurationValue.activeEventId != nil)
    }

    func submit(_ request: ScoutSubmissionRequest) async throws -> Submission { try await send("POST", "GameFormSubmissions/scout", body: request, as: Submission.self) }
    func updateSubmission(id: Int, answers: [ScoutAnswer]) async throws -> Submission { try await send("PUT", "GameFormSubmissions/\(id)", body: UpdateSubmissionRequest(answers: answers), as: Submission.self) }
}

enum RootScreen: String, CaseIterable, Identifiable, Hashable {
    case home = "Home", scout = "Scout", currentEvent = "Current Event", alliancePlan = "Alliance Plan", submitted = "Submitted Forms", settings = "Developer API Settings"
    var id: String { rawValue }
    var icon: String {
        switch self { case .home: return "house.fill"; case .scout: return "plus.circle.fill"; case .currentEvent: return "calendar"; case .alliancePlan: return "person.3.fill"; case .submitted: return "doc.text.fill"; case .settings: return "gearshape.fill" }
    }
}

struct RootView: View {
    @EnvironmentObject private var settings: AppSettings
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var screen: RootScreen = .home
    @State private var drawerOpen = false

    var body: some View {
        Group {
            if horizontalSizeClass == .regular {
                NavigationSplitView {
                    List {
                        ForEach(RootScreen.allCases) { item in
                            Button {
                                screen = item
                            } label: {
                                Label(item.rawValue, systemImage: item.icon)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .listRowBackground(screen == item ? GrizzlyColors.gold.opacity(0.18) : Color.clear)
                        }
                    }
                    .listStyle(.sidebar)
                    .navigationTitle("Grizzly Platform")
                    .safeAreaInset(edge: .bottom) {
                        Text("Robotics Platform")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding()
                    }
                } detail: {
                    NavigationStack {
                        rootContent
                            .navigationTitle(screen.rawValue)
                    }
                }
                .navigationSplitViewStyle(.balanced)
            } else {
                ZStack(alignment: .leading) {
                    NavigationStack {
                        rootContent
                            .navigationTitle(screen.rawValue)
                            .toolbar {
                                ToolbarItem(placement: .topBarLeading) {
                                    Button { withAnimation(.snappy) { drawerOpen.toggle() } } label: {
                                        Image(systemName: "line.3.horizontal").foregroundStyle(GrizzlyColors.gold)
                                    }
                                    .accessibilityLabel("Open navigation menu")
                                }
                            }
                    }
                    if drawerOpen {
                        Color.black.opacity(0.32).ignoresSafeArea().onTapGesture { withAnimation { drawerOpen = false } }
                        DrawerView(selection: $screen) { withAnimation { drawerOpen = false } }
                            .frame(maxWidth: 305)
                            .transition(.move(edge: .leading))
                    }
                }
            }
        }
        .tint(GrizzlyColors.gold)
    }

    @ViewBuilder private var rootContent: some View {
        switch screen { case .home: HomeView(); case .scout: ScoutChoiceView(); case .currentEvent: CurrentEventView(); case .alliancePlan: AlliancePlanView(); case .submitted: SubmittedTeamsView(); case .settings: SettingsView() }
    }
}

private struct GrizzlyPlatformLogo: View {
    private static let logo: UIImage? = {
        guard let path = Bundle.main.path(forResource: "grizzly-logo", ofType: "png") else {
            return nil
        }
        return UIImage(contentsOfFile: path)
    }()

    var body: some View {
        Group {
            if let logo = Self.logo {
                Image(uiImage: logo)
                    .resizable()
                    .scaledToFit()
            } else {
                Image(systemName: "pawprint.fill")
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(GrizzlyColors.ink)
            }
        }
    }
}

struct DrawerView: View {
    @Binding var selection: RootScreen
    let close: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                GrizzlyPlatformLogo()
                    .frame(width: 72, height: 92)
                    .padding(6)
                    .background(GrizzlyColors.homeGold, in: RoundedRectangle(cornerRadius: 10))
                Text("Grizzly Platform")
                    .font(.headline)
                    .foregroundStyle(.white)
                Text("Robotics Platform")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.8))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(24)
            .background(GrizzlyColors.teal)

            ForEach(RootScreen.allCases) { item in
                Button {
                    selection = item
                    close()
                } label: {
                    Label(item.rawValue, systemImage: item.icon)
                        .foregroundStyle(item == selection ? GrizzlyColors.gold : .primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 14)
                }
                .background(item == selection ? GrizzlyColors.gold.opacity(0.14) : .clear)
            }

            Spacer()
            Text("Grizzly Platform • v1.0")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(24)
        }.background(.background).ignoresSafeArea()
    }
}

struct HomeView: View {
    @EnvironmentObject private var settings: AppSettings
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var connectionState: ConnectionState = .checking

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                connectionBanner
                VStack(spacing: 10) {
                    GrizzlyPlatformLogo()
                        .frame(
                            width: horizontalSizeClass == .regular ? 176 : 140,
                            height: horizontalSizeClass == .regular ? 224 : 178
                        )
                        .accessibilityLabel("Grizzly Platform logo")
                    Text("GRIZZLY PLATFORM")
                        .font(.system(size: horizontalSizeClass == .regular ? 30 : 24, weight: .bold, design: .rounded))
                        .foregroundStyle(GrizzlyColors.ink)
                    Text("2026 REBUILT")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(GrizzlyColors.darkGold)
                }
                .padding(.top, 12)

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 230), spacing: 12)], spacing: 12) {
                    NavigationLink(destination: FormLaunchView(kind: .match)) {
                        HomeButtonLabel(title: "SCOUT", icon: "plus.circle.fill")
                    }
                    NavigationLink(destination: CurrentEventView()) {
                        HomeButtonLabel(title: "EVENT", icon: "calendar")
                    }
                    NavigationLink(destination: AlliancePlanView()) {
                        HomeButtonLabel(title: "ALLIANCE SELECTION", icon: "person.3.fill")
                    }
                }

                VStack(alignment: .leading, spacing: 10) {
                    Text("QUICK ACCESS")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(GrizzlyColors.darkGold)
                    NavigationLink(destination: SubmittedTeamsView(allowsEditing: false)) {
                        QuickActionRow(title: "Review submitted scouting", icon: "doc.text.magnifyingglass")
                    }
                    NavigationLink(destination: FormLaunchView(kind: .pit)) {
                        QuickActionRow(title: "Pit scouting", icon: "wrench.and.screwdriver")
                    }
                    NavigationLink(destination: SubmittedTeamsView(allowsEditing: true)) {
                        QuickActionRow(title: "Edit submitted scouting", icon: "pencil.line")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(20)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity)
        }
        .background(GrizzlyColors.homeGold.ignoresSafeArea())
        .task { await checkConnection() }
        .onChange(of: settings.baseURL) { _ in
            Task { await checkConnection() }
        }
    }

    private var connectionBanner: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(connectionState.color)
                .frame(width: 9, height: 9)
            VStack(alignment: .leading, spacing: 2) {
                Text(connectionState.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(GrizzlyColors.ink)
                if let host = settings.normalizedBaseURL?.host {
                    Text(host).font(.caption).foregroundStyle(GrizzlyColors.darkGold)
                }
            }
            Spacer()
            if connectionState == .disconnected {
                Button("Retry") { Task { await checkConnection() } }
                    .font(.subheadline.weight(.semibold))
            }
            NavigationLink(destination: SettingsView()) {
                Image(systemName: "gearshape")
                    .foregroundStyle(GrizzlyColors.ink)
                    .padding(8)
                    .background(.white.opacity(0.65), in: Circle())
            }
            .accessibilityLabel("Developer API Settings")
        }
        .padding(12)
        .background(.white.opacity(0.72), in: RoundedRectangle(cornerRadius: 12))
    }

    private func checkConnection() async {
        connectionState = .checking
        do {
            _ = try await APIClient(settings: settings).activeConfiguration()
            connectionState = .connected
        } catch {
            connectionState = .disconnected
        }
    }
}

private enum ConnectionState {
    case checking, connected, disconnected
    var title: String {
        switch self {
        case .checking: return "Checking server connection…"
        case .connected: return "Connected to scouting server"
        case .disconnected: return "Could not load active device configuration"
        }
    }
    var color: Color {
        switch self {
        case .checking: return .orange
        case .connected: return .green
        case .disconnected: return .red
        }
    }
}

struct HomeButtonLabel: View {
    let title: String; let icon: String
    var body: some View { HStack { Image(systemName: icon).font(.title2); Text(title).font(.headline); Spacer(); Image(systemName: "chevron.right") }.foregroundStyle(GrizzlyColors.ink).frame(maxWidth: .infinity, minHeight: 64).padding(.horizontal, 14).background(.white.opacity(0.75), in: RoundedRectangle(cornerRadius: 10)) }
}

struct QuickActionRow: View {
    let title: String
    let icon: String
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon).frame(width: 24).foregroundStyle(GrizzlyColors.darkGold)
            Text(title).foregroundStyle(GrizzlyColors.ink)
            Spacer()
            Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white.opacity(0.72), in: RoundedRectangle(cornerRadius: 10))
    }
}

struct ScoutChoiceView: View {
    var body: some View { List { Section("Scout") { NavigationLink("Match scouting", destination: FormLaunchView(kind: .match)); NavigationLink("Pit scouting", destination: FormLaunchView(kind: .pit)); NavigationLink("Review submitted forms", destination: SubmittedTeamsView(allowsEditing: false)); NavigationLink("Edit submitted forms", destination: SubmittedTeamsView(allowsEditing: true)) } }.navigationTitle("Scout") }
}

enum ScoutFormKind { case pit, match; var title: String { self == .pit ? "Pit scouting" : "Match scouting" } }

struct FormLaunchView: View {
    let kind: ScoutFormKind
    @EnvironmentObject private var settings: AppSettings
    @State private var formId = 0
    @State private var events: [Event] = []
    @State private var preset = false
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        Group {
            if loading {
                ProgressView("Loading active \(kind.title)…")
            } else if let errorMessage = error {
                ErrorView(message: errorMessage)
            } else if kind == .match {
                MatchSelectionView(formId: formId)
            } else if events.isEmpty {
                ErrorView(message: "No events are available for this form's season.")
            } else if preset, let event = events.first {
                DynamicScoutingFormView(formId: formId, event: event, match: nil, selectedTeam: nil)
            } else {
                List(events) { event in
                    NavigationLink(event.name) {
                        DynamicScoutingFormView(formId: formId, event: event, match: nil, selectedTeam: nil)
                    }
                }
            }
        }
        .navigationTitle(kind.title)
        .task { await load() }
    }

    private func load() async {
        guard loading else { return }
        do {
            let client = APIClient(settings: settings)
            let configuration = try await client.activeConfiguration()
            formId = kind == .pit ? (configuration.activePitFormId ?? 0) : (configuration.activeMatchFormId ?? 0)
            guard formId > 0 else {
                throw APIError.server("No active \(kind == .pit ? "Pit" : "Match") Form has been pushed by the admin.")
            }
            if kind == .pit {
                let selection = try await client.eventSelection(formId: formId)
                events = selection.events
                preset = selection.preset
            }
        } catch let requestError {
            error = requestError.localizedDescription
        }
        loading = false
    }
}

struct MatchSelectionView: View {
    let formId: Int
    @EnvironmentObject private var settings: AppSettings
    @State private var events: [Event] = []
    @State private var selectedEventID: Int?
    @State private var matches: [Match] = []
    @State private var selectedMatchID: Int?
    @State private var selectedTeamID: Int?
    @State private var loading = true
    @State private var loadingMatches = false
    @State private var error: String?

    private var selectedEvent: Event? { events.first { $0.id == selectedEventID } }
    private var selectedMatch: Match? { matches.first { $0.id == selectedMatchID } }
    private var selectedTeam: MatchTeam? { selectedMatch?.teams.first { $0.id == selectedTeamID } }

    var body: some View {
        Group {
            if loading {
                ProgressView("Loading events…")
            } else if events.isEmpty {
                ErrorView(message: error ?? "No events are available for this form's season.")
            } else {
                selectionForm
            }
        }
        .navigationTitle("Select Match")
        .task { await load() }
        .onChange(of: selectedMatchID) { _ in selectedTeamID = nil }
    }

    private var selectionForm: some View {
        Form {
            Section("Event") {
                Picker("Event", selection: eventBinding) {
                    ForEach(events) { event in
                        Text(event.location.isEmpty ? event.name : "\(event.name) — \(event.location)")
                            .tag(Optional(event.id))
                    }
                }
            }

            Section("Match") {
                if loadingMatches {
                    ProgressView("Loading matches…")
                } else if matches.isEmpty {
                    Text("No matches are available for this event.").foregroundStyle(.secondary)
                } else {
                    Picker("Match", selection: $selectedMatchID) {
                        ForEach(matches) { match in Text(match.title).tag(Optional(match.id)) }
                    }
                    Text("Select the team you are scouting.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            if let match = selectedMatch {
                Section("Red Alliance") {
                    ForEach(match.redTeams) { team in teamRow(team, alliance: .red) }
                }
                Section("Blue Alliance") {
                    ForEach(match.blueTeams) { team in teamRow(team, alliance: .blue) }
                }
            }

            Section {
                NavigationLink {
                    if let event = selectedEvent, let match = selectedMatch, let team = selectedTeam {
                        DynamicScoutingFormView(formId: formId, event: event, match: match, selectedTeam: team)
                    } else {
                        EmptyView()
                    }
                } label: {
                    Label("Continue to Scouting", systemImage: "arrow.right.circle.fill")
                        .frame(maxWidth: .infinity, alignment: .center)
                }
                .disabled(selectedEvent == nil || selectedMatch == nil || selectedTeam == nil)
            }
        }
        .frame(maxWidth: 780)
        .frame(maxWidth: .infinity)
    }

    private func teamRow(_ team: MatchTeam, alliance: AllianceColor) -> some View {
        Button {
            selectedTeamID = selectedTeamID == team.id ? nil : team.id
        } label: {
            HStack(spacing: 12) {
                Image(systemName: selectedTeamID == team.id ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(selectedTeamID == team.id ? alliance.tint : .secondary)
                VStack(alignment: .leading, spacing: 3) {
                    Text("\(team.teamNumber) — \(team.name)")
                        .font(.body.weight(.medium))
                        .foregroundStyle(.primary)
                    Text(alliance.label)
                        .font(.caption)
                        .foregroundStyle(alliance.tint)
                }
                Spacer()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var eventBinding: Binding<Int?> {
        Binding(
            get: { selectedEventID },
            set: { newValue in
                guard newValue != selectedEventID else { return }
                selectedEventID = newValue
                selectedMatchID = nil
                selectedTeamID = nil
                if let newValue { Task { await loadMatches(eventID: newValue) } }
            }
        )
    }

    private func load() async {
        do {
            let selection = try await APIClient(settings: settings).eventSelection(formId: formId)
            events = selection.events
            guard !events.isEmpty else { loading = false; return }
            selectedEventID = events.first?.id
            if let eventID = selectedEventID { await loadMatches(eventID: eventID) }
        } catch let requestError {
            error = requestError.localizedDescription
        }
        loading = false
    }

    private func loadMatches(eventID: Int) async {
        loadingMatches = true
        error = nil
        matches = []
        selectedMatchID = nil
        selectedTeamID = nil
        do {
            matches = try await APIClient(settings: settings).matches(eventId: eventID)
            selectedMatchID = matches.first?.id
        } catch let requestError {
            error = requestError.localizedDescription
        }
        loadingMatches = false
    }
}

private enum AllianceColor {
    case red, blue
    var label: String { self == .red ? "Red Alliance" : "Blue Alliance" }
    var tint: Color { self == .red ? .red : .blue }
}

struct DynamicScoutingFormView: View {
    let formId: Int
    let event: Event
    let match: Match?
    let selectedTeam: MatchTeam?
    @EnvironmentObject private var settings: AppSettings

    @State private var form: GameForm?
    @State private var values: [Int: String] = [:]
    @State private var selectedOptions: [Int: Set<String>] = [:]
    @State private var loading = true
    @State private var saving = false
    @State private var error: String?
    @State private var alertMessage: String?

    var body: some View {
        Group {
            if loading {
                ProgressView("Loading form…")
            } else if let errorMessage = error {
                ErrorView(message: errorMessage)
            } else if let form {
                Form {
                    Section {
                        Text(form.description)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        LabeledContent("Event", value: event.name)
                        if let match { LabeledContent("Match", value: match.title) }
                        if let selectedTeam {
                            LabeledContent("Selected team", value: "\(selectedTeam.teamNumber) — \(selectedTeam.name)")
                        }
                    }
                    ForEach(form.fields) { field in fieldView(field) }
                    Section {
                        Button {
                            Task { await submit(form) }
                        } label: {
                            if saving { ProgressView("Submitting…") }
                            else { Label("Submit Form", systemImage: "paperplane.fill") }
                        }
                        .frame(maxWidth: .infinity, alignment: .center)
                        .disabled(saving)
                    }
                }
                .frame(maxWidth: 820)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle(form?.name ?? "Scouting Form")
        .task { await load() }
        .alert("Grizzly Platform", isPresented: Binding(get: { alertMessage != nil }, set: { if !$0 { alertMessage = nil } })) {
            Button("OK") { alertMessage = nil }
        } message: {
            Text(alertMessage ?? "")
        }
    }

    @ViewBuilder private func fieldView(_ field: GameFormField) -> some View {
        Section {
            switch field.type {
            case 0:
                TextField(field.question, text: textBinding(field.id), axis: .vertical).lineLimit(1...5)
            case 1:
                TextField(field.question, text: textBinding(field.id)).keyboardType(.decimalPad)
            case 2:
                Picker(field.question, selection: textBinding(field.id)) {
                    Text("Select…").tag("")
                    Text("Yes").tag("Yes")
                    Text("No").tag("No")
                }
            case 3:
                if field.options.isEmpty {
                    Text("No options available").foregroundStyle(.secondary)
                } else {
                    Picker(field.question, selection: textBinding(field.id)) {
                        Text("Select…").tag("")
                        ForEach(field.options) { Text($0.value).tag($0.value) }
                    }
                }
            case 4:
                Toggle(field.question, isOn: boolBinding(field.id))
            case 5:
                VStack(alignment: .leading) {
                    Text(field.question).font(.headline)
                    ForEach(field.options) { option in Toggle(option.value, isOn: optionBinding(field.id, option.value)) }
                }
            default:
                Text("Unsupported field type \(field.type)").foregroundStyle(.secondary)
            }
            if !field.description.isEmpty { Text(field.description).font(.caption).foregroundStyle(.secondary) }
            if field.required { Text("Required").font(.caption2).foregroundStyle(.red) }
        }
        .disabled(isLockedSystemField(field))
    }

    private func textBinding(_ id: Int) -> Binding<String> { Binding(get: { values[id] ?? "" }, set: { values[id] = $0 }) }
    private func boolBinding(_ id: Int) -> Binding<Bool> { Binding(get: { values[id] == "true" }, set: { values[id] = $0 ? "true" : "false" }) }
    private func optionBinding(_ id: Int, _ option: String) -> Binding<Bool> { Binding(get: { selectedOptions[id]?.contains(option) ?? false }, set: { selected in var set = selectedOptions[id] ?? []; if selected { set.insert(option) } else { set.remove(option) }; selectedOptions[id] = set }) }

    private func load() async {
        guard form == nil else { return }
        do {
            let loaded = try await APIClient(settings: settings).form(formId)
            form = loaded
            if let match, let field = loaded.fields.first(where: { $0.question.caseInsensitiveCompare("Match Number") == .orderedSame }) {
                values[field.id] = String(match.matchNumber)
            }
            if let selectedTeam, let field = loaded.fields.first(where: { $0.question.caseInsensitiveCompare("Team Number") == .orderedSame }) {
                values[field.id] = String(selectedTeam.teamNumber)
            }
            if let field = loaded.fields.first(where: { $0.question.caseInsensitiveCompare("Scout Name") == .orderedSame }),
               values[field.id, default: ""].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                values[field.id] = settings.scoutName
            }
        } catch let requestError {
            error = requestError.localizedDescription
        }
        loading = false
    }

    private func submit(_ form: GameForm) async {
        let teamField = form.fields.first { $0.question.caseInsensitiveCompare("Team Number") == .orderedSame }; let scoutField = form.fields.first { $0.question.caseInsensitiveCompare("Scout Name") == .orderedSame }; let matchField = form.fields.first { $0.question.caseInsensitiveCompare("Match Number") == .orderedSame }
        guard let teamNumber = Int(values[teamField?.id ?? -1] ?? ""), teamNumber > 0 else { alertMessage = "Please enter a valid Team Number."; return }
        let enteredName = values[scoutField?.id ?? -1]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""; let scoutName = enteredName.isEmpty ? settings.scoutName.trimmingCharacters(in: .whitespacesAndNewlines) : enteredName; guard !scoutName.isEmpty else { alertMessage = "Please enter your Scout Name in the form or Developer API Settings."; return }
        let matchNumber = Int(values[matchField?.id ?? -1] ?? ""); if form.isMatch && (matchNumber == nil || matchNumber! <= 0) { alertMessage = "Please enter a valid Match Number."; return }
        for field in form.fields where field.required && value(for: field).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { alertMessage = "Required field is missing: \(field.question)"; return }
        let answers = form.fields.map { ScoutAnswer(gameFormFieldId: $0.id, value: value(for: $0)) }
        let request = ScoutSubmissionRequest(gameFormId: form.id, teamNumber: teamNumber, scoutName: scoutName, eventId: event.id, matchType: form.isMatch ? (match?.matchType ?? "Qualification") : nil, matchNumber: form.isMatch ? (matchNumber ?? match?.matchNumber) : nil, setNumber: form.isMatch ? (match?.setNumber ?? 0) : nil, answers: answers)
        saving = true
        do {
            let result = try await APIClient(settings: settings).submit(request)
            alertMessage = "Submission saved! ID: \(result.id)"
        } catch {
            alertMessage = "Submission failed: \(error.localizedDescription)"
        }
        saving = false
    }

    private func isLockedSystemField(_ field: GameFormField) -> Bool {
        if field.question.caseInsensitiveCompare("Team Number") == .orderedSame, selectedTeam != nil { return true }
        if field.question.caseInsensitiveCompare("Match Number") == .orderedSame, match != nil { return true }
        return false
    }

    private func value(for field: GameFormField) -> String {
        if field.type == 5 {
            let selected = field.options.sorted { $0.displayOrder < $1.displayOrder }
                .map(\.value)
                .filter { selectedOptions[field.id]?.contains($0) == true }
            return (try? String(data: JSONEncoder().encode(selected), encoding: .utf8)) ?? "[]"
        }
        return values[field.id] ?? ""
    }
}

struct CurrentEventView: View {
    @EnvironmentObject private var settings: AppSettings
    @State private var event: Event?; @State private var loading = true; @State private var error: String?
    var body: some View { Group { if loading { ProgressView("Loading active event…") } else if let errorMessage = error { ErrorView(message: errorMessage) } else if let event { Form { Section("Name") { Text(event.name) }; Section("Location") { Text(event.location.isEmpty ? "Not specified" : event.location) }; Section("Dates") { Text("\(event.startDate ?? "TBD") – \(event.endDate ?? "TBD")") }; Section("Event type") { Text(event.eventType) } } } else { ErrorView(message: "No active event has been selected on the desktop app.") } }.navigationTitle("Current Event").task { await load() } }
    private func load() async { do { let client = APIClient(settings: settings); let configuration = try await client.activeConfiguration(); if let id = configuration.activeEventId { event = try await client.events().first(where: { $0.id == id }) } } catch let requestError { error = requestError.localizedDescription }; loading = false }
}

struct SubmittedTeamsView: View {
    var allowsEditing = true
    @EnvironmentObject private var settings: AppSettings
    @State private var submissions: [Submission] = []; @State private var loading = true; @State private var error: String?
    private var teams: [(number: Int, name: String)] { Dictionary(grouping: submissions.compactMap { s -> (Int, String)? in guard let n = s.teamNumber, n > 0 else { return nil }; return (n, s.teamName ?? "") }, by: { $0.0 }).map { (number: $0.key, name: $0.value.first?.1 ?? "") }.sorted { $0.number < $1.number } }
    var body: some View {
        Group {
            if loading {
                ProgressView("Loading submitted forms…")
            } else if let errorMessage = error {
                ErrorView(message: errorMessage)
            } else if teams.isEmpty {
                ErrorView(message: "No submitted forms found.")
            } else {
                List(teams, id: \.number) { team in
                    NavigationLink("Team \(team.number)\(team.name.isEmpty ? "" : " - \(team.name)")") {
                        SubmittedTeamFormsView(teamNumber: team.number, submissions: submissions, allowsEditing: allowsEditing)
                    }
                }
                .refreshable { await load() }
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle(allowsEditing ? "Submitted Forms" : "Review Submitted Forms")
        .task { await load() }
    }

    private func load() async {
        do {
            submissions = try await APIClient(settings: settings).submissions()
            error = nil
        } catch let requestError {
            error = requestError.localizedDescription
        }
        loading = false
    }
}

struct SubmittedTeamFormsView: View {
    let teamNumber: Int
    let submissions: [Submission]
    var allowsEditing = true

    var body: some View {
        List(submissions.filter { $0.teamNumber == teamNumber }) { submission in
            NavigationLink {
                SubmittedFormDetailView(submissionId: submission.id, allowsEditing: allowsEditing)
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(submission.gameFormName ?? "Unknown Form").font(.headline)
                    Text("Type: \(submission.formType ?? "Unknown")").font(.caption)
                    if let date = submission.submittedAt {
                        Text("Submitted: \(date)").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .frame(maxWidth: 760)
        .frame(maxWidth: .infinity)
        .navigationTitle("Team \(teamNumber) Forms")
    }
}

struct SubmittedFormDetailView: View {
    let submissionId: Int
    var allowsEditing = true
    @EnvironmentObject private var settings: AppSettings
    @State private var submission: Submission?; @State private var form: GameForm?; @State private var values: [Int: String] = [:]; @State private var editing = false; @State private var saving = false; @State private var loading = true; @State private var message: String?
    var body: some View {
        Group {
            if loading {
                ProgressView("Loading submitted form…")
            } else if let submission, let form {
                Form {
                    Section {
                        Text(submission.gameFormName ?? form.name).font(.headline)
                        Text("Team \(submission.teamNumber ?? 0)\(submission.teamName.map { " - \($0)" } ?? "")").font(.subheadline)
                        if let match = submission.matchNumber { Text("Match \(match)").font(.subheadline) }
                    }
                    Section("Answers") {
                        ForEach(form.fields) { field in
                            if editing {
                                TextField(field.question, text: binding(field.id), axis: .vertical)
                            } else {
                                VStack(alignment: .leading) {
                                    Text(field.question).font(.caption).foregroundStyle(.secondary)
                                    Text(values[field.id] ?? "")
                                }
                            }
                        }
                        if editing {
                            Button(saving ? "Saving…" : "Save Changes") { Task { await save() } }.disabled(saving)
                        } else if allowsEditing {
                            Button("Edit Form") { editing = true }
                        }
                    }
                }
                .frame(maxWidth: 820)
                .frame(maxWidth: .infinity)
            } else {
                ErrorView(message: message ?? "The submitted form could not be loaded.")
            }
        }
        .navigationTitle("Form Details")
        .task { await load() }
        .alert("Grizzly Platform", isPresented: Binding(get: { message != nil && submission != nil }, set: { if !$0 { message = nil } })) {
            Button("OK") { message = nil }
        } message: {
            Text(message ?? "")
        }
    }
    private func binding(_ id: Int) -> Binding<String> { Binding(get: { values[id] ?? "" }, set: { values[id] = $0 }) }
    private func load() async { do { let client = APIClient(settings: settings); let loadedSubmission = try await client.submission(id: submissionId); submission = loadedSubmission; form = try await client.form(loadedSubmission.gameFormId); for answer in loadedSubmission.answers { values[answer.fieldId] = answer.value } } catch { message = error.localizedDescription }; loading = false }
    private func save() async { guard let form else { return }; saving = true; do { let updated = try await APIClient(settings: settings).updateSubmission(id: submissionId, answers: form.fields.map { ScoutAnswer(gameFormFieldId: $0.id, value: values[$0.id] ?? "") }); submission = updated; editing = false; message = "Changes saved." } catch { message = error.localizedDescription }; saving = false }
}

struct AlliancePlanView: View {
    @EnvironmentObject private var settings: AppSettings
    @State private var events: [Event] = []
    @State private var selectedEventID: Int?
    @State private var plan: AlliancePlanResponse?
    @State private var suggestionTeamID: Int?
    @State private var author = ""
    @State private var suggestionReason = ""
    @State private var loading = true
    @State private var refreshing = false
    @State private var sendingSuggestion = false
    @State private var error: String?
    @State private var alertMessage: String?

    var body: some View {
        Group {
            if loading {
                ProgressView("Loading alliance plan…")
            } else if events.isEmpty && plan == nil {
                ErrorView(message: error ?? "No events are available.")
            } else {
                planForm
            }
        }
        .navigationTitle("Alliance Plan")
        .task { await loadInitial() }
        .alert("Grizzly Platform", isPresented: Binding(get: { alertMessage != nil }, set: { if !$0 { alertMessage = nil } })) {
            Button("OK") { alertMessage = nil }
        } message: {
            Text(alertMessage ?? "")
        }
    }

    private var planForm: some View {
        Form {
            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }

            Section("Event") {
                Picker("Event", selection: $selectedEventID) {
                    ForEach(events) { event in
                        Text(event.location.isEmpty ? event.name : "\(event.name) — \(event.location)")
                            .tag(Optional(event.id))
                    }
                }
                Button {
                    Task { await refreshPlan() }
                } label: {
                    HStack {
                        if refreshing { ProgressView().padding(.trailing, 5) }
                        Label("Refresh Plan", systemImage: "arrow.clockwise")
                    }
                }
                .disabled(refreshing || selectedEventID == nil)
                if let plan, let updatedAt = plan.updatedAt, !updatedAt.isEmpty {
                    Text("Plan last updated \(updatedAt)").font(.caption).foregroundStyle(.secondary)
                }
            }

            if plan == nil, selectedEventID != nil {
                Section {
                    Text("Tap Refresh Plan to load this event’s current plan and suggestions.")
                        .foregroundStyle(.secondary)
                }
            }

            if let plan {
                Section("Proposed Alliance") {
                    LabeledContent("Our team", value: teamName(for: plan.ourTeamId, in: plan))
                    LabeledContent("Partner 1", value: teamName(for: plan.firstPartnerId, in: plan))
                    LabeledContent("Partner 2", value: teamName(for: plan.secondPartnerId, in: plan))
                }

                Section("Strategy and communication notes") {
                    Text(plan.notes.isEmpty ? "No strategy notes published." : plan.notes)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Section("Ordered wishlist") {
                    if plan.wishlist.isEmpty {
                        Text("No wishlist teams published.").foregroundStyle(.secondary)
                    } else {
                        ForEach(plan.wishlist.sorted { $0.position < $1.position }) { entry in
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\(entry.position). \(teamName(for: entry.teamId, in: plan))")
                                    .font(.body.weight(.semibold))
                                if !entry.reason.isEmpty {
                                    Text(entry.reason).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }

                Section("Send a team suggestion") {
                    if plan.teams.isEmpty {
                        Text("No teams are registered or ranked for this event.").foregroundStyle(.secondary)
                    } else {
                        Picker("Team", selection: $suggestionTeamID) {
                            Text("Select a team…").tag(Int?.none)
                            ForEach(plan.teams.sorted { $0.teamNumber < $1.teamNumber }) { team in
                                Text(team.displayName).tag(Optional(team.teamId))
                            }
                        }
                        TextField("Your name or team", text: $author)
                            .textContentType(.name)
                        TextField("Why do you recommend this team?", text: $suggestionReason, axis: .vertical)
                            .lineLimit(3...6)
                        Button {
                            Task { await sendSuggestion(for: plan) }
                        } label: {
                            if sendingSuggestion { ProgressView("Sending…") }
                            else { Label("Send Suggestion", systemImage: "paperplane.fill") }
                        }
                        .disabled(sendingSuggestion || suggestionTeamID == nil || author.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || suggestionReason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }

                Section("Submitted suggestions and host responses") {
                    if plan.suggestions.isEmpty {
                        Text("No suggestions yet.").foregroundStyle(.secondary)
                    } else {
                        ForEach(plan.suggestions.sorted { $0.createdAt > $1.createdAt }) { suggestion in
                            VStack(alignment: .leading, spacing: 5) {
                                HStack {
                                    Text(teamName(for: suggestion.teamId, in: plan)).font(.headline)
                                    Spacer()
                                    Text(suggestion.status).font(.caption.weight(.semibold)).foregroundStyle(statusColor(suggestion.status))
                                }
                                Text("From \(suggestion.author)").font(.caption).foregroundStyle(.secondary)
                                Text(suggestion.reason)
                                if !suggestion.hostResponse.isEmpty {
                                    Text("Host response: \(suggestion.hostResponse)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.vertical, 3)
                        }
                    }
                }
            }
        }
        .frame(maxWidth: 900)
        .frame(maxWidth: .infinity)
        .onChange(of: selectedEventID) { _ in
            plan = nil
            suggestionTeamID = nil
            error = nil
        }
    }

    private func loadInitial() async {
        guard loading else { return }
        do {
            let client = APIClient(settings: settings)
            async let configuration = client.activeConfiguration()
            async let loadedEvents = client.events()
            let (configurationValue, eventValues) = try await (configuration, loadedEvents)
            events = eventValues
            if let activeEventId = configurationValue.activeEventId,
               events.contains(where: { $0.id == activeEventId }) {
                selectedEventID = activeEventId
            } else {
                selectedEventID = events.first?.id
            }
            if author.isEmpty { author = settings.scoutName }
            if selectedEventID != nil { await refreshPlan() }
        } catch let requestError {
            error = requestError.localizedDescription
        }
        loading = false
    }

    private func refreshPlan() async {
        guard let selectedEventID else { return }
        refreshing = true
        do {
            let updatedPlan = try await APIClient(settings: settings).alliancePlan(eventId: selectedEventID)
            plan = updatedPlan
            error = nil
            if suggestionTeamID == nil || !updatedPlan.teams.contains(where: { $0.teamId == suggestionTeamID }) {
                suggestionTeamID = updatedPlan.teams.first?.teamId
            }
        } catch let requestError {
            error = requestError.localizedDescription
        }
        refreshing = false
    }

    private func sendSuggestion(for plan: AlliancePlanResponse) async {
        guard let eventId = selectedEventID, let teamId = suggestionTeamID else { return }
        let cleanAuthor = author.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanReason = suggestionReason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanAuthor.isEmpty, !cleanReason.isEmpty else { return }
        sendingSuggestion = true
        do {
            let request = AllianceSuggestionRequest(id: UUID(), teamId: teamId, author: cleanAuthor, reason: cleanReason)
            let suggestion = try await APIClient(settings: settings).suggestAllianceTeam(eventId: eventId, request: request)
            var updatedPlan = plan
            updatedPlan.suggestions.append(suggestion)
            self.plan = updatedPlan
            suggestionReason = ""
            alertMessage = "Suggestion sent."
        } catch {
            alertMessage = "Could not send suggestion: \(error.localizedDescription)"
        }
        sendingSuggestion = false
    }

    private func teamName(for id: Int?, in plan: AlliancePlanResponse) -> String {
        guard let id else { return "Not chosen" }
        return plan.teams.first { $0.teamId == id }?.displayName ?? "Team ID \(id)"
    }

    private func statusColor(_ status: String) -> Color {
        switch status.lowercased() {
        case "accepted": return .green
        case "dismissed": return .secondary
        default: return .orange
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject private var settings: AppSettings
    var body: some View { Form { Section("Developer API") { TextField("Host API address", text: $settings.baseURL).textInputAutocapitalization(.never).keyboardType(.URL); TextField("Scout name", text: $settings.scoutName) }; Section { Text("This uses the same GameForms, Events, Matches, ActiveScoutingConfiguration, and GameFormSubmissions endpoints as the Android app.").font(.footnote).foregroundStyle(.secondary) } }.navigationTitle("Developer API Settings") }
}

struct ErrorView: View {
    let message: String
    var body: some View { VStack(spacing: 12) { Image(systemName: "exclamationmark.triangle").font(.largeTitle).foregroundStyle(.orange); Text(message).multilineTextAlignment(.center) }.padding() }
}

enum GrizzlyColors {
    static let homeGold = Color(red: 0.804, green: 0.714, blue: 0.353)
    static let gold = Color(red: 0.725, green: 0.647, blue: 0.337)
    static let darkGold = Color(red: 0.427, green: 0.345, blue: 0.125)
    static let teal = Color(red: 0.0, green: 0.34, blue: 0.29)
    static let ink = Color(red: 0.129, green: 0.118, blue: 0.125)
}
