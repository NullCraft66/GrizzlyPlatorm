namespace GrizzlyPlatform.Web.Services;

public sealed class EasterEggService
{
    public event Action? DeveloperPanelRequested;

    public void RequestDeveloperPanel() => DeveloperPanelRequested?.Invoke();
}
