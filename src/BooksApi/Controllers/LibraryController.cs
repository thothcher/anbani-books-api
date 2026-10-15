using BooksApi.Contracts;
using BooksApi.Data;
using BooksApi.Infrastructure;
using BooksApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BooksApi.Controllers;

/// <summary>The user's personal library: favorites, reading progress and statistics.</summary>
[Route("api/library")]
[Tags("Library")]
[Authorize]
public sealed class LibraryController(Catalog catalog, SubscriptionService subscriptions, IClock clock) : ApiControllerBase
{
    /// <summary>რჩეული წიგნები (ბოლოს დამატებული პირველი).</summary>
    [HttpGet("favorites")]
    public async Task<List<BookSummaryDto>> Favorites()
    {
        var user = await CurrentUserAsync();
        var favorites = await Db.Favorites.Include(f => f.Book).ThenInclude(b => b.Category)
            .Where(f => f.UserId == user.Id && f.Book.IsPublished)
            .OrderByDescending(f => f.CreatedAt).ToListAsync();
        return await catalog.SummariesAsync(favorites.Select(f => f.Book).ToList(), user);
    }

    /// <summary>რჩეულებში დამატება (განმეორებით გამოძახება უსაფრთხოა).</summary>
    [HttpPost("favorites/{bookId:int}")]
    public async Task<FavoriteStateDto> AddFavorite(int bookId)
    {
        var user = await CurrentUserAsync();
        if (!await Db.Books.AnyAsync(b => b.Id == bookId && b.IsPublished)) throw ApiException.NotFound("BOOK_NOT_FOUND");
        if (!await Db.Favorites.AnyAsync(f => f.UserId == user.Id && f.BookId == bookId))
        {
            Db.Favorites.Add(new Favorite { TenantId = user.TenantId, UserId = user.Id, BookId = bookId, CreatedAt = clock.UtcNow });
            await Db.SaveChangesAsync();
        }
        return new FavoriteStateDto(bookId, true);
    }

    /// <summary>რჩეულებიდან ამოღება.</summary>
    [HttpDelete("favorites/{bookId:int}")]
    public async Task<FavoriteStateDto> RemoveFavorite(int bookId)
    {
        var user = await CurrentUserAsync();
        await Db.Favorites.Where(f => f.UserId == user.Id && f.BookId == bookId).ExecuteDeleteAsync();
        return new FavoriteStateDto(bookId, false);
    }

    /// <summary>„კითხულობ ახლა“ და დასრულებული წიგნები. status: reading | finished</summary>
    [HttpGet("progress")]
    public async Task<List<LibraryItemDto>> Progress(string? status)
    {
        NewValidator().OneOf("status", status, "reading", "finished").ThrowIfInvalid();
        var user = await CurrentUserAsync();
        var query = Db.ReadingProgress.Include(p => p.Book).ThenInclude(b => b.Category).Where(p => p.UserId == user.Id);
        if (status is not null)
        {
            var s = status.Equals("finished", StringComparison.OrdinalIgnoreCase) ? ReadingStatus.Finished : ReadingStatus.Reading;
            query = query.Where(p => p.Status == s);
        }
        var rows = await query.OrderByDescending(p => p.LastReadAt).ToListAsync();
        var summaries = await catalog.SummariesAsync(rows.Select(r => r.Book).ToList(), user);
        return rows.Select((r, i) => new LibraryItemDto(summaries[i], DtoMapper.Progress(r))).ToList();
    }

    /// <summary>კითხვის პროგრესის შენახვა: რომელ გვერდზე ხარ. ბოლო გვერდზე წიგნი „დასრულებულად“ ითვლება.</summary>
    [HttpPut("progress/{bookId:int}")]
    public async Task<ProgressDto> SaveProgress(int bookId, ProgressRequest req)
    {
        var user = await CurrentUserAsync();
        var book = await Db.Books.FirstOrDefaultAsync(b => b.Id == bookId && b.IsPublished) ?? throw ApiException.NotFound("BOOK_NOT_FOUND");
        NewValidator().Required("currentPage", req.CurrentPage).Range("currentPage", req.CurrentPage, 1, Math.Max(1, book.Pages)).ThrowIfInvalid();

        // saving progress is part of reading, so the same access rules apply
        var state = subscriptions.Describe(user, await subscriptions.LoadAsync(user));
        if (!Catalog.Access(book, user, state).CanRead) throw new ApiException(402, "SUBSCRIPTION_REQUIRED");

        var now = clock.Now(user);
        var page = req.CurrentPage!.Value;
        var progress = await Db.ReadingProgress.FirstOrDefaultAsync(p => p.UserId == user.Id && p.BookId == bookId);
        var previous = progress?.CurrentPage ?? 0;
        if (progress is null)
        {
            progress = new ReadingProgress { TenantId = user.TenantId, UserId = user.Id, BookId = bookId, StartedAt = now };
            Db.ReadingProgress.Add(progress);
        }
        progress.CurrentPage = page;
        progress.TotalPages = book.Pages;
        progress.LastReadAt = now;
        if (page >= book.Pages)
        {
            progress.Status = ReadingStatus.Finished;
            progress.FinishedAt ??= now;
        }
        else if (progress.Status != ReadingStatus.Finished)
        {
            progress.Status = ReadingStatus.Reading;
        }

        // pages read today, for the activity chart (only moving forward counts)
        var gained = Math.Clamp(page - previous, 0, 60);
        if (gained > 0)
        {
            var today = DateOnly.FromDateTime(now);
            var log = await Db.ReadingLogs.FirstOrDefaultAsync(l => l.UserId == user.Id && l.Day == today);
            if (log is null) Db.ReadingLogs.Add(new ReadingLog { TenantId = user.TenantId, UserId = user.Id, Day = today, Pages = gained });
            else log.Pages += gained;
        }
        await Db.SaveChangesAsync();
        return DtoMapper.Progress(progress);
    }

    /// <summary>წიგნის ამოღება კითხვის ისტორიიდან.</summary>
    [HttpDelete("progress/{bookId:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> DeleteProgress(int bookId)
    {
        var user = await CurrentUserAsync();
        await Db.ReadingProgress.Where(p => p.UserId == user.Id && p.BookId == bookId).ExecuteDeleteAsync();
        return NoContent();
    }

    /// <summary>კითხვის სტატისტიკა + ბოლო 84 დღის აქტივობა (GitHub-ის სტილის კალენდრისთვის).</summary>
    [HttpGet("stats")]
    public async Task<ReadingStatsDto> Stats()
    {
        var user = await CurrentUserAsync();
        var today = DateOnly.FromDateTime(clock.Now(user));
        var from = today.AddDays(-83);
        var logs = await Db.ReadingLogs.Where(l => l.UserId == user.Id).ToListAsync();
        var byDay = logs.ToDictionary(l => l.Day, l => l.Pages);

        var activity = Enumerable.Range(0, 84).Select(i => from.AddDays(i))
            .Select(d => new DayActivityDto(d, byDay.GetValueOrDefault(d))).ToList();

        var current = 0;
        for (var d = byDay.ContainsKey(today) ? today : today.AddDays(-1); byDay.ContainsKey(d); d = d.AddDays(-1)) current++;
        var longest = 0;
        var run = 0;
        DateOnly? prev = null;
        foreach (var day in byDay.Keys.Order())
        {
            run = prev is { } p && p.AddDays(1) == day ? run + 1 : 1;
            longest = Math.Max(longest, run);
            prev = day;
        }

        return new ReadingStatsDto(
            await Db.ReadingProgress.CountAsync(p => p.UserId == user.Id),
            await Db.ReadingProgress.CountAsync(p => p.UserId == user.Id && p.Status == ReadingStatus.Finished),
            logs.Sum(l => l.Pages),
            await Db.Favorites.CountAsync(f => f.UserId == user.Id),
            current,
            longest,
            activity);
    }
}
