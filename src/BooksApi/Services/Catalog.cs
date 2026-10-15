using BooksApi.Contracts;
using BooksApi.Data;
using BooksApi.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace BooksApi.Services;

/// <summary>
/// Builds book DTOs in batches: ratings and reader counts combine the built-in demo numbers
/// with the activity inside the current sandbox, and personal fields (isFavorite, progress)
/// are filled when the request is signed in.
/// </summary>
public sealed class Catalog(AppDbContext db, DtoMapper map, Urls urls)
{
    public sealed record Totals(int Count, int Sum);

    public async Task<Dictionary<int, Totals>> ReviewTotalsAsync(IReadOnlyCollection<int> ids) =>
        await db.Reviews.Where(r => ids.Contains(r.BookId))
            .GroupBy(r => r.BookId)
            .Select(g => new { g.Key, Count = g.Count(), Sum = g.Sum(r => r.Rating) })
            .ToDictionaryAsync(x => x.Key, x => new Totals(x.Count, x.Sum));

    public async Task<Dictionary<int, int>> ReaderCountsAsync(IReadOnlyCollection<int> ids) =>
        await db.ReadingProgress.Where(p => ids.Contains(p.BookId))
            .GroupBy(p => p.BookId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count);

    public static (double Rating, int Count) Rating(Book b, Totals? t)
    {
        var count = b.SeedRatingCount + (t?.Count ?? 0);
        if (count == 0) return (0, 0);
        var avg = (b.SeedRating * b.SeedRatingCount + (t?.Sum ?? 0)) / count;
        return (Math.Round(avg, 1), count);
    }

    public sealed record Stats(Dictionary<int, Totals> Reviews, Dictionary<int, int> Readers, HashSet<int> Favorites, Dictionary<int, ReadingProgress> Progress);

    public async Task<Stats> LoadStatsAsync(IReadOnlyCollection<int> ids, User? user)
    {
        var reviews = await ReviewTotalsAsync(ids);
        var readers = await ReaderCountsAsync(ids);
        HashSet<int> favorites = [];
        Dictionary<int, ReadingProgress> progress = [];
        if (user is not null)
        {
            favorites = [.. await db.Favorites.Where(f => f.UserId == user.Id && ids.Contains(f.BookId)).Select(f => f.BookId).ToListAsync()];
            progress = await db.ReadingProgress.Where(p => p.UserId == user.Id && ids.Contains(p.BookId)).ToDictionaryAsync(p => p.BookId);
        }
        return new Stats(reviews, readers, favorites, progress);
    }

    public void FillSummary(BookSummaryDto d, Book b, Stats s, User? user)
    {
        var (rating, count) = Rating(b, s.Reviews.GetValueOrDefault(b.Id));
        d.Id = b.Id;
        d.Title = b.Title;
        d.Author = b.Author;
        d.CoverUrl = urls.Cover(b);
        d.Category = map.CategoryRef(b.Category);
        d.Language = b.Language;
        d.Year = b.Year;
        d.YearLabel = map.Lang.Pick(b.YearLabel ?? b.Year?.ToString() ?? "", b.YearLabelEn);
        d.Pages = b.Pages;
        d.ReadingMinutes = b.ReadingMinutes;
        d.Rating = rating;
        d.RatingCount = count;
        d.Readers = b.SeedReaders + s.Readers.GetValueOrDefault(b.Id);
        d.IsFree = b.IsFree;
        d.IsNew = map.IsNew(b);
        d.IsFavorite = user is null ? null : s.Favorites.Contains(b.Id);
        d.Progress = user is not null && s.Progress.TryGetValue(b.Id, out var p) ? DtoMapper.Progress(p) : null;
        d.IsPublished = b.IsPublished;
        d.IsSystem = b.TenantId is null;
    }

    public async Task<List<BookSummaryDto>> SummariesAsync(IReadOnlyList<Book> books, User? user)
    {
        var stats = await LoadStatsAsync(books.Select(b => b.Id).ToList(), user);
        return books.Select(b =>
        {
            var d = new BookSummaryDto();
            FillSummary(d, b, stats, user);
            return d;
        }).ToList();
    }

    public async Task<BookDetailsDto> DetailsAsync(Book b, User? user, SubscriptionState? state)
    {
        var stats = await LoadStatsAsync([b.Id], user);
        var d = new BookDetailsDto();
        FillSummary(d, b, stats, user);
        d.Description = map.Lang.Pick(b.Description, b.DescriptionEn);
        d.Translator = b.Translator;
        d.Tags = b.Tags.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        d.PreviewUrl = urls.Preview(b);
        d.PreviewPages = b.PreviewPages;
        d.Chapters = map.Chapters(b);
        d.RatingBreakdown = await BreakdownAsync(b);
        d.Access = Access(b, user, state);
        d.HasPdf = b.PdfFile is not null;
        d.CanEdit = user?.Role == UserRole.Admin && b.TenantId is not null;
        d.Source = b.SourceName is null ? null : new SourceDto(b.SourceName, b.SourceUrl);
        d.CreatedAt = b.CreatedAt;
        d.UpdatedAt = b.UpdatedAt;
        return d;
    }

    public static BookAccessDto Access(Book b, User? user, SubscriptionState? state)
    {
        var canPreview = b.PreviewFile is not null;
        if (b.PdfFile is null) return new(false, false, canPreview, "noFile");
        if (user is null) return new(false, false, canPreview, "loginRequired");
        // admins can always open the books they uploaded (to check them); the built-in library follows the normal rules
        if (user.Role == UserRole.Admin && b.TenantId is not null) return new(true, true, canPreview, "admin");
        if (b.IsFree) return new(true, true, canPreview, "free");
        if (state is { HasAccess: true }) return new(true, state.CanDownload, canPreview, state.IsTrial ? "trial" : "subscription");
        return new(false, false, canPreview, "subscriptionRequired");
    }

    /// <summary>Stars histogram: built-in ratings are spread around their average, then real reviews are added.</summary>
    private async Task<Dictionary<string, int>> BreakdownAsync(Book b)
    {
        var result = new Dictionary<string, int> { ["5"] = 0, ["4"] = 0, ["3"] = 0, ["2"] = 0, ["1"] = 0 };
        if (b.SeedRatingCount > 0)
        {
            var center = b.SeedRating + (b.SeedRating - 3) * 0.35;
            var weights = Enumerable.Range(1, 5).Select(k => Math.Exp(-Math.Pow(k - center, 2) / 1.62)).ToArray();
            var total = weights.Sum();
            var assigned = 0;
            for (var k = 5; k >= 2; k--)
            {
                var n = (int)Math.Round(b.SeedRatingCount * weights[k - 1] / total);
                result[k.ToString()] = n;
                assigned += n;
            }
            result["1"] = Math.Max(0, b.SeedRatingCount - assigned);
        }
        var real = await db.Reviews.Where(r => r.BookId == b.Id).GroupBy(r => r.Rating).Select(g => new { g.Key, Count = g.Count() }).ToListAsync();
        foreach (var r in real) result[r.Key.ToString()] += r.Count;
        return result;
    }
}
