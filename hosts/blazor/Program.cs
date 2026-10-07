using ComboHost.Components;
using Radzen;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddRazorComponents().AddInteractiveServerComponents();
builder.Services.AddRadzenComponents();

var app = builder.Build();
app.UseStaticFiles();
app.UseAntiforgery();

// The element, served from the repo's src/ — one file, never a copy.
var combo = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "../../src/elephant-combo.js"));
app.MapGet("/js/elephant-combo.js", () => Results.File(combo, "text/javascript"));
// Mirror of serve.mjs: a type other than strain-lot is refused the way Elephant's /cases/options refuses one.
app.MapGet("/api/options", (string? caseType, string? q, int? limit) => caseType == "strain-lot"
    ? Results.Json(ComboHost.Strains.Search(caseType, q, limit))
    : Results.BadRequest(new { errors = new[] { $"Case type '{caseType}' declares no summary.search: descriptor." } }));

app.MapRazorComponents<App>().AddInteractiveServerRenderMode();
app.Run();
