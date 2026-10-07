using Elephant.Combo;

namespace ComboHost;

// Mirror of hosts/static/data.js — keep the two in step.
public static class Strains
{
    static readonly (string Code, string Org)[] Orgs =
    [
        ("PA", "Pseudomonas aeruginosa"), ("KP", "Klebsiella pneumoniae"), ("SA", "Staphylococcus aureus"),
        ("EC", "Escherichia coli"), ("AB", "Acinetobacter baumannii"), ("NG", "Neisseria gonorrhoeae"),
        ("EF", "Enterococcus faecium"), ("BS", "Bacillus subtilis"),
    ];
    static readonly string[] Sources = ["ATCC", "DSMZ", "CDC AR Bank", "clinical isolate", "in-house", "NCTC", "BEI"];

    // `withHref` gives each row a link, as a case source would.
    public static IReadOnlyList<ComboOption> Make(int n, bool withHref = false) => Enumerable.Range(0, n).Select(i =>
    {
        var (code, org) = Orgs[i % Orgs.Length];
        var id = $"{code}-{i + 1:D4}";
        return new ComboOption(id, id, $"{org} · {Sources[i % Sources.Length]}", [$"{code}{i + 1:D4}"],
            Href: withHref ? $"/cases/{id}" : null);
    }).ToList();

    public static readonly IReadOnlyList<(string Id, ComboConfig Config, int Rows)> Kinds =
    [
        ("single", new ComboConfig(Max: 1, Placeholder: "Strain…"), 1500),
        ("custom", new ComboConfig(Max: 1, AllowCustom: true, Placeholder: "Strain or new name…"), 1200),
        ("multi3", new ComboConfig(Max: 3, Placeholder: "Up to 3…"), 1000),
        ("tri", new ComboConfig(States: ["include", "exclude"], Placeholder: "Filter…"), 1800),
        ("excl", new ComboConfig(States: ["exclude"], Placeholder: "Exclude…"), 1000),
        ("server", new ComboConfig(Max: 1, Search: "/api/options?caseType=strain-lot", Placeholder: "Search…"), 0),
        ("refused", new ComboConfig(Max: 1, Search: "/api/options?caseType=unsearchable", Placeholder: "Search…"), 0),
    ];

    // Mirror of serverSearch in data.js: deliberately loose (any token, any field).
    static readonly IReadOnlyList<ComboOption> Searchable = Make(5000, withHref: true);
    public static object Search(string? caseType, string? q, int? limit)
    {
        var tokens = (q ?? "").ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var take = limit ?? 50;
        var hits = Searchable.Where(o => tokens.Any(t =>
            o.Label.Contains(t, StringComparison.OrdinalIgnoreCase)
            || (o.Description?.Contains(t, StringComparison.OrdinalIgnoreCase) ?? false))).ToList();
        return new { options = hits.Take(take), hasMore = hits.Count > take };
    }
}
