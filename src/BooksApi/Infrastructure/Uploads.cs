namespace BooksApi.Infrastructure;

/// <summary>
/// Upload checks. The file type is detected from the first bytes ("magic numbers"), never from the
/// file name or the Content-Type the client claims. SVG is deliberately not accepted for user uploads:
/// an SVG can contain JavaScript.
/// </summary>
public static class Uploads
{
    public static IFormFile Require(IFormFile? file, long maxBytes)
    {
        if (file is null || file.Length == 0) throw ApiException.BadRequest("FILE_REQUIRED");
        if (file.Length > maxBytes)
            throw new ApiException(413, "FILE_TOO_LARGE") { Extensions = { ["maxBytes"] = maxBytes } };
        return file;
    }

    public static (string Extension, string ContentType) DetectImage(Stream s)
    {
        Span<byte> h = stackalloc byte[12];
        var n = s.Read(h);
        s.Position = 0;
        if (n >= 3 && h[0] == 0xFF && h[1] == 0xD8 && h[2] == 0xFF) return (".jpg", "image/jpeg");
        if (n >= 8 && h[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A })) return (".png", "image/png");
        if (n >= 12 && h[..4].SequenceEqual("RIFF"u8) && h[8..12].SequenceEqual("WEBP"u8)) return (".webp", "image/webp");
        throw new ApiException(415, "UNSUPPORTED_FILE_TYPE") { Extensions = { ["allowed"] = new[] { "image/jpeg", "image/png", "image/webp" } } };
    }

    public static string ContentTypeFor(string path) => Path.GetExtension(path).ToLowerInvariant() switch
    {
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".webp" => "image/webp",
        ".svg" => "image/svg+xml",
        ".pdf" => "application/pdf",
        _ => "application/octet-stream",
    };
}
