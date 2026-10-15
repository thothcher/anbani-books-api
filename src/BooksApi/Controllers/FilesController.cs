using BooksApi.Data;
using BooksApi.Infrastructure;
using BooksApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BooksApi.Controllers;

/// <summary>
/// File URLs that appear in API responses. They need no headers, so they work directly in
/// &lt;img src&gt;, &lt;iframe src&gt; and PDF.js: covers and previews are public (unguessable keys),
/// full books use signed links that expire.
/// </summary>
[ApiController]
[Route("files")]
[ApiExplorerSettings(IgnoreApi = true)]
public sealed class FilesController(AppDbContext db, FileStorage storage, FileLinkSigner signer, IClock clock) : ControllerBase
{
    [HttpGet("covers/{key}")]
    [ResponseCache(Duration = 86400)]
    public async Task<IActionResult> Cover(string key)
    {
        var book = await db.Books.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(b => b.CoverKey == key);
        if (book is null) throw ApiException.NotFound("NOT_FOUND");
        if (book.CoverFile is not null && storage.Exists(book.CoverFile))
            return PhysicalFile(storage.Resolve(book.CoverFile), Uploads.ContentTypeFor(book.CoverFile));
        if (book.Slug is not null && storage.Exists($"seed:covers/{book.Slug}.svg"))
            return PhysicalFile(storage.Resolve($"seed:covers/{book.Slug}.svg"), "image/svg+xml");
        return Content(CoverRenderer.Render(book), "image/svg+xml");
    }

    [HttpGet("previews/{key}.pdf")]
    public async Task<IActionResult> Preview(string key)
    {
        var book = await db.Books.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(b => b.PreviewKey == key);
        if (book?.PreviewFile is null || !storage.Exists(book.PreviewFile)) throw ApiException.NotFound("NOT_FOUND");
        Response.Headers.CacheControl = "public, max-age=3600";
        return PhysicalFile(storage.Resolve(book.PreviewFile), "application/pdf", enableRangeProcessing: true);
    }

    [HttpGet("books/{token}")]
    public async Task<IActionResult> Book(string token)
    {
        var (link, error) = signer.Validate(token, clock.UtcNow);
        if (link is null) throw new ApiException(403, error!);
        var book = await db.Books.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(b => b.Id == link.BookId);
        if (book?.PdfFile is null || !storage.Exists(book.PdfFile)) throw ApiException.NotFound("BOOK_NOT_FOUND");
        Response.Headers.CacheControl = "private, max-age=600";
        var name = (book.Slug ?? $"book-{book.Id}") + ".pdf";
        return link.Download
            ? PhysicalFile(storage.Resolve(book.PdfFile), "application/pdf", name, enableRangeProcessing: true)
            : PhysicalFile(storage.Resolve(book.PdfFile), "application/pdf", enableRangeProcessing: true);
    }

    [HttpGet("avatars/{key}")]
    [ResponseCache(Duration = 86400)]
    public async Task<IActionResult> Avatar(string key)
    {
        var user = await db.Users.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(u => u.AvatarKey == key);
        if (user?.AvatarFile is null || !storage.Exists(user.AvatarFile)) throw ApiException.NotFound("NOT_FOUND");
        return PhysicalFile(storage.Resolve(user.AvatarFile), Uploads.ContentTypeFor(user.AvatarFile));
    }
}
