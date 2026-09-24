namespace GrizzlyPlatform.Web.Services;

public sealed class EasterEggService
{
    public event Action? DeveloperPanelRequested;
    public event Action? ScreensaverRequested;

    public void RequestDeveloperPanel() => DeveloperPanelRequested?.Invoke();
    public void RequestScreensaver() => ScreensaverRequested?.Invoke();
}


