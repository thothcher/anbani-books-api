using BooksApi.Contracts;
using BooksApi.Data;
using BooksApi.Infrastructure;
using BooksApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BooksApi.Controllers;

/// <summary>Query parameters of GET /api/books (names are case-insensitive: page = Page).</summary>
public sealed class BookQuery
{
    /// <summary>Search in title, author, translator and tags.</summary>
    public string? Q { get; set; }
    public int? CategoryId { get; set; }
    /// <summary>ka | en</summary>
    public string? Language { get; set; }
    public bool? IsFree { get; set; }
    public double? MinRating { get; set; }
    public int? MinPages { get; set; }
    public int? MaxPages { get; set; }
    public int? YearFrom { get; set; }
    public int? YearTo { get; set; }
    /// <summary>popular (default) | rating | newest | title | year | pages</summary>
    public string? Sort { get; set; }
    /// <summary>asc | desc (each sort has a sensible default)</summary>
    public string? Order { get; set; }
    public int? Page { get; set; }
    public int? PageSize { get; set; }
    /// <summary>Admins only: also return unpublished drafts.</summary>
    public bool? IncludeDrafts { get; set; }
}

/// <summary>The catalog, reading links, and book management for admins.</summary>
[Route("api/books")]
[Tags("Books")]
public sealed class BooksController(
    Catalog catalog,
    SubscriptionService subscriptions,
    FileLinkSigner signer,
    FileStorage storage,
    Urls urls,
    IOptions<SandboxOptions> sandbox,
    IClock clock) : ApiControllerBase
{
    private static readonly string[] Sorts = ["popular", "rating", "newest", "title", "year", "pages"];

    /// <summary>წიგნების სია: ძებნა, ფილტრები, სორტირება და პაგინაცია.</summary>
    /// <remarks>Example: GET /api/books?q=sherlock&amp;categoryId=5&amp;language=en&amp;sort=rating&amp;page=1&amp;pageSize=12</remarks>
    [HttpGet]
    public async Task<PagedResult<BookSummaryDto>> List([FromQuery] BookQuery filter)
    {
        var v = NewValidator()
            .OneOf("sort", filter.Sort, Sorts)
            .OneOf("order", filter.Order, "asc", "desc")
            .OneOf("language", filter.Language, "ka", "en")
            .Range("minRating", filter.MinRating, 0, 5)
            .Range("minPages", filter.MinPages, 0, 10000)
            .Range("maxPages", filter.MaxPages, 0, 10000)
            .MaxLength("q", filter.Q, 100);
        var (page, pageSize) = Paging.Read(v, filter.Page, filter.PageSize);
        v.ThrowIfInvalid();

        var user = await OptionalUserAsync();
        var drafts = filter.IncludeDrafts == true && user?.Role == UserRole.Admin;

        var query = Db.Books.Include(b => b.Category).Where(b => drafts || b.IsPublished);
        if (filter.CategoryId is { } cat) query = query.Where(b => b.CategoryId == cat);
        if (filter.Language is { } lang) query = query.Where(b => b.Language == lang.ToLower());
        if (filter.IsFree is { } free) query = query.Where(b => b.IsFree == free);
        if (filter.MinPages is { } minP) query = query.Where(b => b.Pages >= minP);
        if (filter.MaxPages is { } maxP) query = query.Where(b => b.Pages <= maxP);
        if (filter.YearFrom is { } yf) query = query.Where(b => b.Year >= yf);
        if (filter.YearTo is { } yt) query = query.Where(b => b.Year <= yt);
        var books = await query.ToListAsync();

        if (!string.IsNullOrWhiteSpace(filter.Q))
        {
            var term = filter.Q.Trim().ToLowerInvariant();
            books = books.Where(b => $"{b.Title} {b.Author} {b.Translator} {b.Tags}".ToLowerInvariant().Contains(term)).ToList();
        }

        // ratings and reader counts include this sandbox's own activity, so sorting happens after loading
        var ids = books.Select(b => b.Id).ToList();
        var reviews = await catalog.ReviewTotalsAsync(ids);
        var readers = await catalog.ReaderCountsAsync(ids);
        double RatingOf(Book b) => Catalog.Rating(b, reviews.GetValueOrDefault(b.Id)).Rating;
        int ReadersOf(Book b) => b.SeedReaders + readers.GetValueOrDefault(b.Id);

        if (filter.MinRating is { } minR) books = books.Where(b => RatingOf(b) >= minR).ToList();

        var sort = (filter.Sort ?? "popular").ToLowerInvariant();
        var desc = filter.Order is null ? sort is "popular" or "rating" or "newest" : filter.Order.Equals("desc", StringComparison.OrdinalIgnoreCase);
        Func<Book, object> key = sort switch
        {
            "rating" => b => RatingOf(b),
            "newest" => b => b.CreatedAt,
            "title" => b => b.Title,
            "year" => b => b.Year ?? int.MaxValue,
            "pages" => b => b.Pages,
            _ => b => ReadersOf(b),
        };
        var ordered = (desc ? books.OrderByDescending(key) : books.OrderBy(key)).ThenBy(b => b.Id).ToList();

        var pageItems = ordered.Skip((page - 1) * pageSize).Take(pageSize).ToList();
        var items = await catalog.SummariesAsync(pageItems, user);
        return PagedResult<BookSummaryDto>.Create(items, page, pageSize, ordered.Count);
    }

    /// <summary>წიგნის დეტალები: აღწერა, სარჩევი, რეიტინგი და რისი უფლება აქვს მიმდინარე მომხმარებელს (access).</summary>
    [HttpGet("{id:int}")]
    public async Task<BookDetailsDto> Get(int id)
    {
        var user = await OptionalUserAsync();
        var book = await FindAsync(id, user);
        SubscriptionState? state = null;
        if (user is not null) state = subscriptions.Describe(user, await subscriptions.LoadAsync(user));
        return await catalog.DetailsAsync(book, user, state);
    }

    /// <summary>მსგავსი წიგნები (იგივე კატეგორიიდან).</summary>
    [HttpGet("{id:int}/related")]
    public async Task<List<BookSummaryDto>> Related(int id, int? take)
    {
        var user = await OptionalUserAsync();
        var book = await FindAsync(id, user);
        var candidates = await Db.Books.Include(b => b.Category)
            .Where(b => b.IsPublished && b.Id != id && b.CategoryId == book.CategoryId).ToListAsync();
        if (candidates.Count < 3)
            candidates.AddRange(await Db.Books.Include(b => b.Category)
                .Where(b => b.IsPublished && b.Id != id && b.CategoryId != book.CategoryId && b.Language == book.Language).ToListAsync());
        var readers = await catalog.ReaderCountsAsync(candidates.Select(b => b.Id).ToList());
        var top = candidates.OrderByDescending(b => b.SeedReaders + readers.GetValueOrDefault(b.Id)).Take(Math.Clamp(take ?? 6, 1, 12)).ToList();
        return await catalog.SummariesAsync(top, user);
    }

    /// <summary>
    /// სრული PDF-ის წაკითხვის დროებითი ბმული (2 საათი). საჭიროა ავტორიზაცია და აქტიური გამოწერა/საცდელი პერიოდი
    /// (ან უფასო წიგნი). 402 — გამოწერა არ გაქვთ.
    /// </summary>
    [HttpGet("{id:int}/read")]
    [Authorize]
    public async Task<FileLinkDto> Read(int id) => await LinkAsync(id, download: false);

    /// <summary>ჩამოტვირთვის დროებითი ბმული. ჩამოტვირთვა შედის მხოლოდ წლიურ გეგმაში (არა საცდელში).</summary>
    [HttpGet("{id:int}/download")]
    [Authorize]
    public async Task<FileLinkDto> Download(int id) => await LinkAsync(id, download: true);

    private async Task<FileLinkDto> LinkAsync(int id, bool download)
    {
        var user = await CurrentUserAsync();
        var book = await FindAsync(id, user);
        var state = subscriptions.Describe(user, await subscriptions.LoadAsync(user));
        var access = Catalog.Access(book, user, state);
        if (access.Reason == "noFile") throw ApiException.Conflict("NO_PDF");
        if (!access.CanRead) throw new ApiException(402, "SUBSCRIPTION_REQUIRED");
        if (download && !access.CanDownload) throw ApiException.Forbidden("DOWNLOAD_NOT_INCLUDED");

        var expires = clock.UtcNow.AddMinutes(sandbox.Value.FileLinkMinutes);
        var token = signer.Create(new FileLink(book.Id, user.Id, user.TenantId, download, expires));
        var progress = await Db.ReadingProgress.FirstOrDefaultAsync(p => p.UserId == user.Id && p.BookId == id);
        return new FileLinkDto(urls.SignedFile(token), expires, FileName(book), book.Pages, progress?.CurrentPage);
    }

    // ── management (admins of the sandbox) ─────────────────────────────────

    /// <summary>ახალი წიგნის შექმნა (Admin). იქმნება როგორც draft — PDF-ის ატვირთვის შემდეგ შეგიძლიათ გამოაქვეყნოთ.</summary>
    [HttpPost]
    [Authorize]
    [ProducesResponseType<BookDetailsDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Create(BookRequest req)
    {
        var admin = await AdminAsync();
        await ValidateAsync(req, creating: true);
        if (req.IsPublished == true) throw ApiException.Conflict("PDF_REQUIRED");

        var now = clock.UtcNow;
        var book = new Book
        {
            TenantId = admin.TenantId,
            CoverKey = Guid.NewGuid().ToString("N"),
            PreviewKey = Guid.NewGuid().ToString("N"),
            CreatedByUserId = admin.Id,
            CreatedAt = now,
            UpdatedAt = now,
        };
        Apply(book, req);
        Db.Books.Add(book);
        await Db.SaveChangesAsync();
        await Db.Entry(book).Reference(b => b.Category).LoadAsync();
        return StatusCode(201, await catalog.DetailsAsync(book, admin, null));
    }

    /// <summary>წიგნის რედაქტირება (Admin). გაგზავნეთ მხოლოდ შესაცვლელი ველები — null ნიშნავს „არ შეიცვალოს“.</summary>
    [HttpPut("{id:int}")]
    [Authorize]
    public async Task<BookDetailsDto> Update(int id, BookRequest req)
    {
        var admin = await AdminAsync();
        var book = await OwnBookAsync(id);
        await ValidateAsync(req, creating: false);
        if (req.IsPublished == true && book.PdfFile is null) throw ApiException.Conflict("PDF_REQUIRED");
        Apply(book, req);
        book.UpdatedAt = clock.UtcNow;
        await Db.SaveChangesAsync();
        await Db.Entry(book).Reference(b => b.Category).LoadAsync();
        return await catalog.DetailsAsync(book, admin, null);
    }

    /// <summary>წიგნის წაშლა (Admin, მხოლოდ თქვენ მიერ შექმნილი).</summary>
    [HttpDelete("{id:int}")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(int id)
    {
        await AdminAsync();
        var book = await OwnBookAsync(id);
        storage.Delete(book.PdfFile);
        storage.Delete(book.PreviewFile);
        storage.Delete(book.CoverFile);
        Db.Books.Remove(book);
        await Db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>PDF-ის ატვირთვა (Admin): multipart/form-data, ველი "file". გვერდები ითვლება და preview ავტომატურად იქმნება.</summary>
    [HttpPut("{id:int}/pdf")]
    [Authorize]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(64 * 1024 * 1024)]
    public async Task<PdfUploadResponse> UploadPdf(int id, IFormFile? file)
    {
        var admin = await AdminAsync();
        var book = await OwnBookAsync(id);
        Uploads.Require(file, sandbox.Value.MaxPdfMb * 1024L * 1024);
        await using var stream = file!.OpenReadStream();
        if (!PdfTools.LooksLikePdf(stream)) throw new ApiException(415, "INVALID_PDF");
        if (storage.TenantUsage(admin.TenantId) + file.Length > sandbox.Value.StorageQuotaMb * 1024L * 1024)
            throw new ApiException(413, "STORAGE_QUOTA_EXCEEDED");

        var pdfPath = await storage.SaveAsync(admin.TenantId, "books", stream, ".pdf");
        var pages = PdfTools.CountPages(storage.Resolve(pdfPath)) ?? Math.Max(book.Pages, 1);

        var previewPages = PdfTools.PreviewLength(pages);
        var previewPath = storage.NewPath(admin.TenantId, "previews", ".pdf");
        var previewOk = PdfTools.TryWritePreview(storage.Resolve(pdfPath), storage.Resolve(previewPath), previewPages);

        storage.Delete(book.PdfFile);
        storage.Delete(book.PreviewFile);
        book.PdfFile = pdfPath;
        book.PdfSize = file.Length;
        book.Pages = pages;
        book.ReadingMinutes = Math.Max(5, pages * 2);
        book.PreviewFile = previewOk ? previewPath : null;
        book.PreviewSize = previewOk ? new FileInfo(storage.Resolve(previewPath)).Length : 0;
        book.PreviewPages = previewOk ? previewPages : 0;
        book.PreviewKey = Guid.NewGuid().ToString("N");
        book.UpdatedAt = clock.UtcNow;
        await Db.SaveChangesAsync();
        return new PdfUploadResponse(pages, book.PreviewPages, file.Length, urls.Preview(book), previewOk);
    }

    /// <summary>ყდის სურათის ატვირთვა (Admin): JPG / PNG / WEBP, ველი "file".</summary>
    [HttpPut("{id:int}/cover")]
    [Authorize]
    [Consumes("multipart/form-data")]
    public async Task<CoverUploadResponse> UploadCover(int id, IFormFile? file)
    {
        var admin = await AdminAsync();
        var book = await OwnBookAsync(id);
        Uploads.Require(file, sandbox.Value.MaxImageMb * 1024L * 1024);
        await using var stream = file!.OpenReadStream();
        var (ext, _) = Uploads.DetectImage(stream);
        if (storage.TenantUsage(admin.TenantId) + file.Length > sandbox.Value.StorageQuotaMb * 1024L * 1024)
            throw new ApiException(413, "STORAGE_QUOTA_EXCEEDED");
        var path = await storage.SaveAsync(admin.TenantId, "covers", stream, ext);
        storage.Delete(book.CoverFile);
        book.CoverFile = path;
        book.UpdatedAt = clock.UtcNow;
        await Db.SaveChangesAsync();
        return new CoverUploadResponse(urls.Cover(book));
    }

    /// <summary>ატვირთული ყდის წაშლა — წიგნი დაუბრუნდება ავტომატურად დაგენერირებულ ყდას.</summary>
    [HttpDelete("{id:int}/cover")]
    [Authorize]
    public async Task<CoverUploadResponse> DeleteCover(int id)
    {
        await AdminAsync();
        var book = await OwnBookAsync(id);
        storage.Delete(book.CoverFile);
        book.CoverFile = null;
        book.UpdatedAt = clock.UtcNow;
        await Db.SaveChangesAsync();
        return new CoverUploadResponse(urls.Cover(book));
    }

    // ── helpers ────────────────────────────────────────────────────────────

    private async Task<Book> FindAsync(int id, User? user)
    {
        var book = await Db.Books.Include(b => b.Category).FirstOrDefaultAsync(b => b.Id == id);
        if (book is null || (!book.IsPublished && user?.Role != UserRole.Admin)) throw ApiException.NotFound("BOOK_NOT_FOUND");
        return book;
    }

    private async Task<Book> OwnBookAsync(int id)
    {
        var book = await Db.Books.Include(b => b.Category).FirstOrDefaultAsync(b => b.Id == id) ?? throw ApiException.NotFound("BOOK_NOT_FOUND");
        if (book.TenantId is null) throw ApiException.Forbidden("SYSTEM_RESOURCE");
        return book;
    }

    private async Task ValidateAsync(BookRequest req, bool creating)
    {
        var v = NewValidator();
        if (creating || req.Title is not null) v.Required("title", req.Title).Length("title", req.Title, 1, 150);
        if (creating || req.Author is not null) v.Required("author", req.Author).Length("author", req.Author, 2, 100);
        if (creating || req.Description is not null) v.Required("description", req.Description).Length("description", req.Description, 20, 4000);
        if (creating || req.Language is not null) v.Required("language", req.Language).OneOf("language", req.Language, "ka", "en");
        if (creating) v.Required("categoryId", req.CategoryId);
        v.MaxLength("translator", req.Translator, 100)
            .MaxLength("descriptionEn", req.DescriptionEn, 4000)
            .Range("year", req.Year, -3000, DateTime.UtcNow.Year)
            .Range("pages", req.Pages, 1, 10000)
            .Must(req.Tags is null || (req.Tags.Length <= 10 && req.Tags.All(t => t.Trim().Length is > 0 and <= 30)), "tags",
                "მაქსიმუმ 10 თეგი, თითოეული 1–30 სიმბოლო.", "At most 10 tags, each 1–30 characters.");
        if (req.CategoryId is { } cat && !await Db.Categories.AnyAsync(c => c.Id == cat))
            v.Add("categoryId", "ასეთი კატეგორია არ არსებობს.", "This category does not exist.");
        v.ThrowIfInvalid();
    }

    private void Apply(Book book, BookRequest req)
    {
        if (req.Title is not null) book.Title = req.Title.Trim();
        if (req.Author is not null) book.Author = req.Author.Trim();
        if (req.Translator is not null) book.Translator = string.IsNullOrWhiteSpace(req.Translator) ? null : req.Translator.Trim();
        if (req.Description is not null) book.Description = req.Description.Trim();
        if (req.DescriptionEn is not null) book.DescriptionEn = string.IsNullOrWhiteSpace(req.DescriptionEn) ? null : req.DescriptionEn.Trim();
        if (req.CategoryId is { } cat) book.CategoryId = cat;
        if (req.Language is not null) book.Language = req.Language.ToLowerInvariant();
        if (req.Year is not null) book.Year = req.Year;
        if (req.Pages is { } pages && book.PdfFile is null) { book.Pages = pages; book.ReadingMinutes = Math.Max(5, pages * 2); }
        if (req.IsFree is { } free) book.IsFree = free;
        if (req.Tags is not null) book.Tags = string.Join(',', req.Tags.Select(t => t.Trim()).Where(t => t.Length > 0));
        if (req.IsPublished is { } published)
        {
            if (published && !book.IsPublished) book.PublishedAt = clock.UtcNow;
            book.IsPublished = published;
        }
    }

    private static string FileName(Book b)
    {
        var name = b.Slug ?? new string(b.Title.Select(c => char.IsLetterOrDigit(c) ? c : '-').ToArray()).Trim('-');
        return $"{(string.IsNullOrEmpty(name) ? "book" : name)}.pdf";
    }
}
