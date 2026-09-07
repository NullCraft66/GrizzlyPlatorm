namespace GrizzlyPlatform.Web.Services;

public class AuthState
{
    public event Action? OnChange;

    public bool IsLoggedIn { get; private set; }

    public int UserId { get; private set; }

    public string Username { get; private set; } = "";

    public string DisplayName { get; private set; } = "";

    public string Role { get; private set; } = "";

    public bool IsAdmin =>
        IsLoggedIn &&
        Role.Equals("Admin", StringComparison.OrdinalIgnoreCase);

    public bool IsScout =>
        IsLoggedIn &&
        Role.Equals("Scout", StringComparison.OrdinalIgnoreCase);

    public bool IsViewer =>
        IsLoggedIn &&
        Role.Equals("Viewer", StringComparison.OrdinalIgnoreCase);

    public void Login(
        int userId,
        string username,
        string displayName,
        string role)
    {
        UserId = userId;
        Username = username;
        DisplayName = displayName;
        Role = role;
        IsLoggedIn = true;

        OnChange?.Invoke();
    }

    public void Logout()
    {
        UserId = 0;
        Username = "";
        DisplayName = "";
        Role = "";
        IsLoggedIn = false;

        OnChange?.Invoke();
    }
}
