namespace Elephant.Combo;

/// <summary>One option. <c>Id</c> is what gets selected; <c>Atoms</c> are extra search terms that never render.</summary>
public sealed record ComboOption(
    string Id,
    string Label,
    string? Description = null,
    IReadOnlyList<string>? Atoms = null,
    bool Ghost = false,
    string? Swatch = null,
    IReadOnlyList<ComboBadge>? Badges = null,
    string? Href = null);

/// <summary>A pill on the right of a row. Tone: green | red | blue | amber | gray.</summary>
public sealed record ComboBadge(string Text, string? Tone = null);

/// <summary>The one selection shape for every mode. Single and multi only fill <c>Include</c>.</summary>
public sealed record ComboSelection(IReadOnlyList<string> Include, IReadOnlyList<string> Exclude)
{
    public static readonly ComboSelection Empty = new([], []);
    public static ComboSelection Of(params string[] include) => new(include, []);
}

/// <summary>
/// The mode. <c>States</c>: ["include"] = single/multi, ["include","exclude"] = tri-state,
/// ["exclude"] = exclude-only. <c>Max</c> 1 = single. <c>Search</c> is a URL for server-side search.
/// </summary>
public sealed record ComboConfig(
    IReadOnlyList<string>? States = null,
    int? Max = null,
    bool AllowCustom = false,
    string? Placeholder = null,
    string? Search = null,
    int? Limit = null,
    string? LinkTarget = null)
{
    public static readonly ComboConfig Single = new(Max: 1);
    public static readonly ComboConfig Multi = new();
    public static readonly ComboConfig TriState = new(States: ["include", "exclude"]);
}

/// <summary>Display for a selected id. <c>Href</c> renders a ↗ link next to it.</summary>
public sealed record ComboItem(string Label, string? Description, string? Href = null);

/// <summary>A commit: pick, remove (chip ×) or custom.</summary>
public sealed record ComboChange(ComboSelection Selection, Dictionary<string, ComboItem> Items, string Reason);
