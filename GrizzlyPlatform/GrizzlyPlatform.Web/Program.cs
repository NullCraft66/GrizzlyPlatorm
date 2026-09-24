using GrizzlyPlatform.Web.Components;
using GrizzlyPlatform.Web.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddScoped(sp => new HttpClient
{
    BaseAddress = new Uri(
        builder.Configuration["ApiBaseUrl"]
        ?? "http://localhost:5263/"
    )
});
// Authentication state
builder.Services.AddScoped<AuthState>();
// Shared event channel for cross-page developer easter eggs.
builder.Services.AddScoped<EasterEggService>();

// Add services to the container.
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}
app.UseStatusCodePagesWithReExecute("/not-found", createScopeForStatusCodePages: true);
// HTTPS disabled for local scouting prototype

app.UseWebSockets();
app.UseAntiforgery();

// Let the native Mac shell confirm the embedded web host is ready without
// waiting for a dashboard page that may be loading data from the API server.
app.MapGet("/_mac-ready", () => Results.Ok());

app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.Run();



