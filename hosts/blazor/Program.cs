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

app.MapRazorComponents<App>().AddInteractiveServerRenderMode();
app.Run();
