using System.Security.Cryptography;
using System.Text;
using BooksApi.Infrastructure;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;

namespace BooksApi.Services;

public sealed record FileLink(int BookId, int UserId, int TenantId, bool Download, DateTime ExpiresAt);

/// <summary>
/// Signed, expiring links for full PDFs. A browser can't send an Authorization header from
/// &lt;iframe src&gt; or &lt;a href download&gt;, so instead the API hands out a short-lived URL whose
/// signature proves "user X may read book Y until time Z" (the same idea as S3 pre-signed URLs).
/// </summary>
public sealed class FileLinkSigner(IOptions<JwtOptions> jwt)
{
    private byte[] Key => SHA256.HashData(Encoding.UTF8.GetBytes("file-links:" + jwt.Value.Secret));

    public string Create(FileLink link)
    {
        var payload = $"{link.BookId}.{link.UserId}.{link.TenantId}.{(link.Download ? 'd' : 'r')}.{new DateTimeOffset(link.ExpiresAt).ToUnixTimeSeconds()}";
        var data = Encoding.UTF8.GetBytes(payload);
        var sig = HMACSHA256.HashData(Key, data);
        return $"{WebEncoders.Base64UrlEncode(data)}.{WebEncoders.Base64UrlEncode(sig.AsSpan(0, 18))}";
    }

    /// <summary>Returns the link or an error code (LINK_INVALID / LINK_EXPIRED).</summary>
    public (FileLink? Link, string? Error) Validate(string token, DateTime now)
    {
        try
        {
            var parts = token.Split('.');
            if (parts.Length != 2) return (null, "LINK_INVALID");
            var data = WebEncoders.Base64UrlDecode(parts[0]);
            var expected = HMACSHA256.HashData(Key, data).AsSpan(0, 18);
            if (!CryptographicOperations.FixedTimeEquals(expected, WebEncoders.Base64UrlDecode(parts[1]))) return (null, "LINK_INVALID");
            var f = Encoding.UTF8.GetString(data).Split('.');
            var link = new FileLink(int.Parse(f[0]), int.Parse(f[1]), int.Parse(f[2]), f[3] == "d",
                DateTimeOffset.FromUnixTimeSeconds(long.Parse(f[4])).UtcDateTime);
            return link.ExpiresAt < now ? (null, "LINK_EXPIRED") : (link, null);
        }
        catch (FormatException)
        {
            return (null, "LINK_INVALID");
        }
    }
}
