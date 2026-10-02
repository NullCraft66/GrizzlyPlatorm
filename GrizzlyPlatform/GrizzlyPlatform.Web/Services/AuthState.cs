namespace GrizzlyPlatform.Web.Services;

public class AuthState
{
    private readonly Dictionary<string, HashSet<string>> roleTabs = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Viewer"] = new(["home", "seasons", "events"]),
        ["Scout"] = new(["home", "seasons", "events", "scouting"]),
        ["Admin"] = new(["home", "seasons", "events", "event-operations", "gameforms", "device-pairing", "device-configuration", "nexus", "scouting", "submissions", "appearance", "alliance-selection", "alliance-plan"]),
        ["UltimateAdmin"] = new(["home", "seasons", "events", "event-operations", "gameforms", "device-pairing", "device-configuration", "nexus", "scouting", "submissions", "appearance", "account-management", "alliance-selection", "alliance-plan"])
    };
    public event Action? OnChange;

    public bool IsLoggedIn { get; private set; }

    public int UserId { get; private set; }

    public string Username { get; private set; } = "";

    public string DisplayName { get; private set; } = "";

    public string Role { get; private set; } = "";
    public string AllowedPages { get; private set; } = "*";

    public bool IsPinkAdmin => IsAdmin && Username.Equals("awoodman", StringComparison.OrdinalIgnoreCase);

    public bool IsKimTheme => IsAdmin && Username.Equals("jkim", StringComparison.OrdinalIgnoreCase);

    public bool IsAdmin =>
        IsLoggedIn &&
        (Role.Equals("Admin", StringComparison.OrdinalIgnoreCase) || Role.Equals("UltimateAdmin", StringComparison.OrdinalIgnoreCase) || Username.Equals("awoodman", StringComparison.OrdinalIgnoreCase) || Username.Equals("jkim", StringComparison.OrdinalIgnoreCase));

    public bool IsScout =>
        IsLoggedIn &&
        Role.Equals("Scout", StringComparison.OrdinalIgnoreCase);

    public bool IsViewer =>
        IsLoggedIn &&
        Role.Equals("Viewer", StringComparison.OrdinalIgnoreCase);

    public bool CanSee(string tab)
    {
        var role = IsLoggedIn ? Role : "Viewer";
        if (role.Equals("UltimateAdmin", StringComparison.OrdinalIgnoreCase))
            return true;
        return roleTabs.TryGetValue(role, out var tabs) && tabs.Contains(tab);
    }

    public void SetRoleTabs(string role, IEnumerable<string> tabs)
    {
        roleTabs[role] = new HashSet<string>(tabs, StringComparer.OrdinalIgnoreCase);
        OnChange?.Invoke();
    }

    public void Login(
        int userId,
        string username,
        string displayName,
        string role,
        string allowedPages = "*")
    {
        UserId = userId;
        Username = username;
        DisplayName = username.Equals("awoodman", StringComparison.OrdinalIgnoreCase) ? "Mrs. Woodman" : username.Equals("jkim", StringComparison.OrdinalIgnoreCase) ? "Dr. Kim" : displayName;
        Role = (username.Equals("awoodman", StringComparison.OrdinalIgnoreCase) || username.Equals("jkim", StringComparison.OrdinalIgnoreCase)) ? "Staff" : role;
        AllowedPages = allowedPages ?? "*";
        IsLoggedIn = true;

        OnChange?.Invoke();
    }

    public void Logout()
    {
        UserId = 0;
        Username = "";
        DisplayName = "";
        Role = "";
        AllowedPages = "";
        IsLoggedIn = false;

        OnChange?.Invoke();
    }

    public bool CanAccess(string page) => IsAdmin || AllowedPages == "*" ||
        AllowedPages.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Contains(page, StringComparer.OrdinalIgnoreCase);
}





