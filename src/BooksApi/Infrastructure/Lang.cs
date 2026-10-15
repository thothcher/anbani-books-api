namespace BooksApi.Infrastructure;

/// <summary>
/// The API answers in Georgian by default and in English when the request sends
/// <c>Accept-Language: en</c>. Applies to error messages, category names, plan texts and descriptions.
/// </summary>
public enum Lang { Ka, En }

public static class LangExtensions
{
    public static Lang GetLang(this HttpContext? http)
    {
        if (http is null) return Lang.Ka;
        if (http.Items.TryGetValue(typeof(Lang), out var cached) && cached is Lang l) return l;
        var header = http.Request.Headers.AcceptLanguage.ToString();
        var lang = header.TrimStart().StartsWith("en", StringComparison.OrdinalIgnoreCase) ? Lang.En : Lang.Ka;
        http.Items[typeof(Lang)] = lang;
        return lang;
    }

    public static string Pick(this Lang lang, string ka, string? en) =>
        lang == Lang.En && !string.IsNullOrWhiteSpace(en) ? en : ka;

    public static string Code(this Lang lang) => lang == Lang.En ? "en" : "ka";
}
