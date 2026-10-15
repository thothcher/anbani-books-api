using BooksApi.Data;
using BooksApi.Infrastructure;
using Microsoft.Extensions.Options;

namespace BooksApi.Services;

/// <summary>Builds the absolute URLs that appear in API responses (covers, previews, avatars, signed links).</summary>
public sealed class Urls(IHttpContextAccessor accessor, IOptions<HostingOptions> hosting)
{
    public string Base
    {
        get
        {
            if (!string.IsNullOrWhiteSpace(hosting.Value.PublicBaseUrl)) return hosting.Value.PublicBaseUrl.TrimEnd('/');
            var req = accessor.HttpContext?.Request;
            return req is null ? "" : $"{req.Scheme}://{req.Host}{req.PathBase}";
        }
    }

    private static long Version(DateTime d) => new DateTimeOffset(d).ToUnixTimeSeconds();

    public string Cover(Book b) => $"{Base}/files/covers/{b.CoverKey}?v={Version(b.UpdatedAt)}";
    public string? Preview(Book b) => b.PreviewFile is null ? null : $"{Base}/files/previews/{b.PreviewKey}.pdf";
    public string? Avatar(User u) => u.AvatarKey is null ? null : $"{Base}/files/avatars/{u.AvatarKey}?v={Version(u.UpdatedAt)}";
    public string SignedFile(string token) => $"{Base}/files/books/{token}";
}
