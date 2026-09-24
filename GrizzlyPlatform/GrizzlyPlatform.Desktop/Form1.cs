using System.Diagnostics;
using System.Drawing;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace GrizzlyPlatform.Desktop;

public partial class Form1 : Form
{
    private readonly WebView2 webView = new();
    private readonly Panel loadingPanel = new();
    private readonly Label loadingLabel = new();
    private readonly PictureBox loadingLogo = new();
    private readonly System.Windows.Forms.Timer loadingPulseTimer = new() { Interval = 45 };
    private double loadingPulsePhase;
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
        webView.Visible = false;
        webView.NavigationCompleted += (_, _) =>
        {
            loadingPanel.Visible = false;
            webView.Visible = true;
        };

        loadingPanel.Dock = DockStyle.Fill;
        loadingPanel.BackColor = Color.FromArgb(205, 182, 90);
        loadingLabel.AutoSize = false;
        loadingLabel.Size = new Size(620, 100);
        loadingLabel.Text = "GRIZZLY ROBOTICS" + Environment.NewLine + Environment.NewLine + "Starting platform services...";
        loadingLabel.ForeColor = Color.FromArgb(33, 30, 32);
        loadingLabel.Font = new Font("Segoe UI", 18, FontStyle.Bold);
        loadingLabel.TextAlign = ContentAlignment.MiddleCenter;

        var logoPath = Path.Combine(AppContext.BaseDirectory, "images", "loading-pulse.gif");
        if (File.Exists(logoPath))
        {
            loadingLogo.Image = Image.FromFile(logoPath);
            loadingLogo.Size = new Size(220, 220);
            loadingLogo.SizeMode = PictureBoxSizeMode.Zoom;
            loadingLogo.BackColor = Color.Transparent;
            loadingPanel.Controls.Add(loadingLogo);
        }
        loadingPanel.Controls.Add(loadingLabel);
        loadingPanel.Resize += (_, _) => LayoutLoadingControls();
        LayoutLoadingControls();
        loadingPulseTimer.Tick += (_, _) =>
        {
            if (!loadingPanel.Visible || loadingLogo.Image is null) return;
            loadingPulsePhase += 0.10;
            var scale = 1.0 + 0.08 * Math.Sin(loadingPulsePhase);
            var size = (int)(220 * scale);
            loadingLogo.Size = new Size(size, size);
            LayoutLoadingControls();
        };
        loadingPulseTimer.Start();
        Controls.Add(webView);
        Controls.Add(loadingPanel);
        Shown += async (_, _) => await StartServicesSafelyAsync();
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
            var path = Path.Combine(AppContext.BaseDirectory, "images", "kiwi-bear.png");
            if (!File.Exists(path)) path = Path.Combine(FindProjectRoot(), "GrizzlyPlatform.Desktop", "kiwi-bear.png");
            if (File.Exists(path)) using (var bitmap = new Bitmap(path)) Icon = Icon.FromHandle(bitmap.GetHicon());
        }
        catch { }
    }

    private void LayoutLoadingControls()
    {
        loadingLogo.Location = new Point(
            Math.Max(0, (loadingPanel.ClientSize.Width - loadingLogo.Width) / 2),
            Math.Max(20, (loadingPanel.ClientSize.Height - 300) / 2));
        loadingLabel.Location = new Point(
            Math.Max(0, (loadingPanel.ClientSize.Width - loadingLabel.Width) / 2),
            loadingLogo.Bottom + 18);
    }
    private async Task StartServicesSafelyAsync()
    {
        try
        {
            await StartServicesAsync();
        }
        catch (Exception ex)
        {
            loadingLabel.Text = "GRIZZLY ROBOTICS" + Environment.NewLine + Environment.NewLine + "Unable to start the platform." + Environment.NewLine + Environment.NewLine + ex.Message;
            loadingLabel.ForeColor = Color.FromArgb(120, 25, 25);
        }
    }

    private async Task StartServicesAsync()
    {
        var root = FindProjectRoot();
        var apiProject = Path.Combine(root, "GrizzlyPlatform.Api", "GrizzlyPlatform.Api.csproj");
        var webProject = Path.Combine(root, "GrizzlyPlatform.Web", "GrizzlyPlatform.Web.csproj");
        var apiExe = Path.Combine(AppContext.BaseDirectory, "Api", "GrizzlyPlatform.Api.exe");
        var webExe = Path.Combine(AppContext.BaseDirectory, "Web", "GrizzlyPlatform.Web.exe");
        var apiListen = Setting("ApiUrl", "http://0.0.0.0:5263");
        var apiBrowser = Setting("ApiBrowserUrl", "http://localhost:5263");
        var webListen = Setting("WebListenUrl", "http://0.0.0.0:5273");
        var webBrowser = Setting("WebUrl", "http://localhost:5273");
        var database = Setting("DatabasePath", "grizzlyplatform.db");

        var apiHealthUrl = $"{apiBrowser}/api/health";
        if (!await IsServiceReadyAsync(apiHealthUrl))
        {
            var apiArguments = $"--urls {apiListen} --ConnectionStrings:Default=\"Data Source={database}\"";
            apiProcess = File.Exists(apiExe)
                ? StartExecutable(apiExe, apiArguments, Path.GetDirectoryName(apiExe)!)
                : StartDotnet(apiProject, apiArguments, Path.GetDirectoryName(apiProject)!);
            await WaitForServiceAsync(apiHealthUrl);
        }

        if (!await IsServiceReadyAsync(webBrowser))
        {
            var webArguments = $"--urls {webListen} --ApiBaseUrl={apiBrowser}/";
            webProcess = File.Exists(webExe)
                ? StartExecutable(webExe, webArguments, Path.GetDirectoryName(webExe)!)
                : StartDotnet(webProject, webArguments, Path.GetDirectoryName(webProject)!);
            await WaitForServiceAsync(webBrowser);
        }

        var userDataFolder = Path.Combine(Path.GetTempPath(), "GrizzlyPlatform-WebView2", Environment.ProcessId.ToString());
        Directory.CreateDirectory(userDataFolder);
        var environment = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
        await webView.EnsureCoreWebView2Async(environment);
        webView.Source = new Uri($"{webBrowser}?v={DateTime.UtcNow.Ticks}");
    }

    private static async Task<bool> IsServiceReadyAsync(string url)
    {
        try
        {
            var endpoint = new Uri(url);
            using var client = new System.Net.Sockets.TcpClient();
            await client.ConnectAsync(endpoint.Host, endpoint.Port);
            return client.Connected;
        }
        catch (System.Net.Sockets.SocketException) { return false; }
        catch (UriFormatException) { return false; }
    }

    private static async Task WaitForServiceAsync(string url)
    {
        for (var attempt = 0; attempt < 40; attempt++)
        {
            if (await IsServiceReadyAsync(url)) return;
            await Task.Delay(250);
        }
        throw new InvalidOperationException($"Service did not become ready: {url}");
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











