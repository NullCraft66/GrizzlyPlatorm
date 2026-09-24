namespace GrizzlyPlatform.Web.Services;

public class AuthState
{
    public event Action? OnChange;

    public bool IsLoggedIn { get; private set; }

    public int UserId { get; private set; }

    public string Username { get; private set; } = "";

    public string DisplayName { get; private set; } = "";

    public string Role { get; private set; } = "";

    public bool IsPinkAdmin => IsAdmin && Username.Equals("awoodman", StringComparison.OrdinalIgnoreCase);

    public bool IsKimTheme => IsAdmin && Username.Equals("jkim", StringComparison.OrdinalIgnoreCase);

    public bool IsAdmin =>
        IsLoggedIn &&
        (Role.Equals("Admin", StringComparison.OrdinalIgnoreCase) || Username.Equals("awoodman", StringComparison.OrdinalIgnoreCase) || Username.Equals("jkim", StringComparison.OrdinalIgnoreCase));

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
        DisplayName = username.Equals("awoodman", StringComparison.OrdinalIgnoreCase) ? "Mrs. Woodman" : username.Equals("jkim", StringComparison.OrdinalIgnoreCase) ? "Dr. Kim" : displayName;
        Role = (username.Equals("awoodman", StringComparison.OrdinalIgnoreCase) || username.Equals("jkim", StringComparison.OrdinalIgnoreCase)) ? "Staff" : role;
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





