using System.Security.Cryptography;
using System.Text.Json;
using GrizzlyPlatform.Api.Models;
using Microsoft.AspNetCore.DataProtection;

namespace GrizzlyPlatform.Api.Services;

/// <summary>
/// Stores the host's Nexus settings outside the repository and protects the
/// API key with ASP.NET Core Data Protection before persisting it.
/// </summary>
public sealed class NexusSettingsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly string _settingsPath;
    private readonly IDataProtector _protector;
    private readonly object _gate = new();

    public NexusSettingsStore(
        IConfiguration configuration,
        IHostEnvironment environment,
        IDataProtectionProvider dataProtectionProvider)
    {
        var configuredPath = configuration["NexusSettings:FilePath"];
        if (!string.IsNullOrWhiteSpace(configuredPath))
        {
            _settingsPath = Path.GetFullPath(configuredPath);
        }
        else
        {
            var localData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var dataDirectory = string.IsNullOrWhiteSpace(localData)
                ? Path.Combine(environment.ContentRootPath, "App_Data")
                : Path.Combine(localData, "GrizzlyPlatform");
            _settingsPath = Path.Combine(dataDirectory, "nexus-settings.json");
        }

        _protector = dataProtectionProvider.CreateProtector("GrizzlyPlatform.NexusSettings.v1");
    }

    public NexusSettings Get()
    {
        lock (_gate)
        {
            return ReadLocked();
        }
    }

    public void Save(NexusSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);

        lock (_gate)
        {
            var current = ReadLocked();
            var apiKey = string.IsNullOrWhiteSpace(settings.ApiKey)
                ? current.ApiKey
                : settings.ApiKey.Trim();
            var stored = new StoredSettings
            {
                ProtectedApiKey = string.IsNullOrEmpty(apiKey) ? "" : _protector.Protect(apiKey),
                EventKey = settings.EventKey.Trim(),
                Enabled = settings.Enabled
            };

            var directory = Path.GetDirectoryName(_settingsPath)
                ?? throw new InvalidOperationException("Nexus settings path has no parent directory.");
            Directory.CreateDirectory(directory);

            var temporaryPath = _settingsPath + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                File.WriteAllText(temporaryPath, JsonSerializer.Serialize(stored, JsonOptions));
                File.Move(temporaryPath, _settingsPath, overwrite: true);
            }
            finally
            {
                if (File.Exists(temporaryPath))
                    File.Delete(temporaryPath);
            }
        }
    }

    private NexusSettings ReadLocked()
    {
        if (!File.Exists(_settingsPath))
            return new NexusSettings();

        var stored = JsonSerializer.Deserialize<StoredSettings>(
            File.ReadAllText(_settingsPath), JsonOptions);
        if (stored is null)
            return new NexusSettings();

        string apiKey;
        try
        {
            apiKey = string.IsNullOrEmpty(stored.ProtectedApiKey)
                ? ""
                : _protector.Unprotect(stored.ProtectedApiKey);
        }
        catch (CryptographicException exception)
        {
            throw new InvalidOperationException(
                "Nexus settings could not be decrypted. Restore the ASP.NET Data Protection key ring before continuing.",
                exception);
        }

        return new NexusSettings
        {
            ApiKey = apiKey,
            EventKey = stored.EventKey ?? "",
            Enabled = stored.Enabled
        };
    }

    private sealed class StoredSettings
    {
        public string ProtectedApiKey { get; set; } = "";
        public string EventKey { get; set; } = "";
        public bool Enabled { get; set; }
    }
}
