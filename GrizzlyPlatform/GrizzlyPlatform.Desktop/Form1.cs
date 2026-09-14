using System.Diagnostics;
using System.Drawing;
using System.Text.Json;
using Microsoft.Web.WebView2.WinForms;

namespace GrizzlyPlatform.Desktop;

public partial class Form1 : Form
{
    private readonly WebView2 webView = new();
    private Process? apiProcess;
    private Process? webProcess;
    private readonly JsonElement settings;

    public Form1()
    {
        Text = "Grizzly Robotics Platform";
        settings = LoadSettings();
        TrySetAppIcon();
        WindowState = FormWindowState.Maximized;
        webView.Dock = DockStyle.Fill;
        Controls.Add(webView);
        Shown += async (_, _) => await StartServicesAsync();
        FormClosing += (_, _) => StopServices();
    }

    private static JsonElement LoadSettings()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
        return File.Exists(path) ? JsonDocument.Parse(File.ReadAllText(path)).RootElement : default;
    }

    private string Setting(string name, string fallback) =>
        settings.ValueKind == JsonValueKind.Object && settings.TryGetProperty(name, out var value)
            ? value.GetString() ?? fallback : fallback;

    private void TrySetAppIcon()
    {
        try
        {
            var path = Path.Combine(AppContext.BaseDirectory, "images", "grizzly-app-icon.png");
            if (!File.Exists(path)) path = Path.Combine(FindProjectRoot(), "GrizzlyPlatform.Web", "wwwroot", "images", "grizzly-app-icon.png");
            if (File.Exists(path)) using (var bitmap = new Bitmap(path)) Icon = Icon.FromHandle(bitmap.GetHicon());
        }
        catch { }
    }

    private async Task StartServicesAsync()
    {
        var root = FindProjectRoot();
        var apiProject = Path.Combine(root, "GrizzlyPlatform.Api", "GrizzlyPlatform.Api.csproj");
        var webProject = Path.Combine(root, "GrizzlyPlatform.Web", "GrizzlyPlatform.Web.csproj");
        var apiExe = Path.Combine(AppContext.BaseDirectory, "Api", "GrizzlyPlatform.Api.exe");
        var webExe = Path.Combine(AppContext.BaseDirectory, "Web", "GrizzlyPlatform.Web.exe");
        var apiListen = Setting("ApiUrl", "http://0.0.0.0:5263");
        var apiBrowser = Setting("ApiBrowserUrl", "http://127.0.0.1:5263");
        var webListen = Setting("WebListenUrl", "http://0.0.0.0:5273");
        var webBrowser = Setting("WebUrl", "http://127.0.0.1:5273");
        var database = Setting("DatabasePath", "grizzlyplatform.db");

        apiProcess = File.Exists(apiExe)
            ? StartExecutable(apiExe, $"--urls {apiListen}", Path.GetDirectoryName(apiExe)!)
            : StartDotnet(apiProject, $"--urls {apiListen}", Path.GetDirectoryName(apiProject)!);
        webProcess = File.Exists(webExe)
            ? StartExecutable(webExe, $"--urls {webListen} --ApiBaseUrl={apiBrowser}/", Path.GetDirectoryName(webExe)!)
            : StartDotnet(webProject, $"--urls {webListen} --ApiBaseUrl={apiBrowser}/", Path.GetDirectoryName(webProject)!);
        apiProcess.StartInfo.Environment["ConnectionStrings__Default"] = $"Data Source={database}";
        await webView.EnsureCoreWebView2Async();
        webView.Source = new Uri(webBrowser);
    }

    private static Process StartDotnet(string project, string arguments, string workingDirectory) =>
        StartExecutable("dotnet", $"run --project \"{project}\" {arguments}", workingDirectory);

    private static Process StartExecutable(string fileName, string arguments, string workingDirectory) => Process.Start(new ProcessStartInfo
    {
        FileName = fileName, Arguments = arguments, WorkingDirectory = workingDirectory,
        UseShellExecute = false, CreateNoWindow = true
    })!;

    private static string FindProjectRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "GrizzlyPlatform.Api", "GrizzlyPlatform.Api.csproj"))) return directory.FullName;
            directory = directory.Parent;
        }
        return AppContext.BaseDirectory;
    }

    private void StopServices()
    {
        foreach (var process in new[] { apiProcess, webProcess })
        {
            try { if (process is { HasExited: false }) process.Kill(entireProcessTree: true); } catch { }
            process?.Dispose();
        }
    }
}

