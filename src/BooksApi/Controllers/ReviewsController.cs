using BooksApi.Contracts;
using BooksApi.Data;
using BooksApi.Infrastructure;
using BooksApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BooksApi.Controllers;

/// <summary>Ratings (1–5 stars) and comments. One review per user per book.</summary>
[Tags("Reviews")]
public sealed class ReviewsController(DtoMapper map, IClock clock) : ApiControllerBase
{
    /// <summary>წიგნის შეფასებები (პაგინაციით). sort: newest | highest | lowest. mine=true — მხოლოდ ჩემი შეფასება.</summary>
    [HttpGet("api/books/{bookId:int}/reviews")]
    public async Task<PagedResult<ReviewDto>> List(int bookId, int? page, int? pageSize, string? sort, bool? mine)
    {
        var v = NewValidator().OneOf("sort", sort, "newest", "highest", "lowest");
        var (p, size) = Paging.Read(v, page, pageSize, defaultSize: 10, max: 50);
        v.ThrowIfInvalid();
        await EnsureBookAsync(bookId);

        var query = Db.Reviews.Include(r => r.User).Where(r => r.BookId == bookId);
        if (mine == true) query = query.Where(r => r.UserId == (CurrentUserId ?? -1));
        query = sort?.ToLowerInvariant() switch
        {
            "highest" => query.OrderByDescending(r => r.Rating).ThenByDescending(r => r.Id),
            "lowest" => query.OrderBy(r => r.Rating).ThenByDescending(r => r.Id),
            _ => query.OrderByDescending(r => r.Id),
        };
        var total = await query.CountAsync();
        var items = await query.Skip((p - 1) * size).Take(size).ToListAsync();
        return PagedResult<ReviewDto>.Create(items.Select(r => map.Review(r, CurrentUserId)).ToList(), p, size, total);
    }

    /// <summary>შეფასების დამატება. 409 — ამ წიგნს უკვე შეაფასეთ.</summary>
    [HttpPost("api/books/{bookId:int}/reviews")]
    [Authorize]
    [ProducesResponseType<ReviewDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Create(int bookId, ReviewRequest req)
    {
        Validate(req);
        var user = await CurrentUserAsync();
        await EnsureBookAsync(bookId);
        if (await Db.Reviews.AnyAsync(r => r.BookId == bookId && r.UserId == user.Id)) throw ApiException.Conflict("ALREADY_REVIEWED");

        var now = clock.UtcNow;
        var review = new Review
        {
            TenantId = user.TenantId, BookId = bookId, UserId = user.Id, User = user,
            Rating = req.Rating!.Value, Comment = req.Comment?.Trim() ?? "", CreatedAt = now, UpdatedAt = now,
        };
        Db.Reviews.Add(review);
        await Db.SaveChangesAsync();
        return StatusCode(201, map.Review(review, user.Id));
    }

    /// <summary>საკუთარი შეფასების რედაქტირება.</summary>
    [HttpPut("api/reviews/{id:int}")]
    [Authorize]
    public async Task<ReviewDto> Update(int id, ReviewRequest req)
    {
        Validate(req);
        var user = await CurrentUserAsync();
        var review = await Db.Reviews.Include(r => r.User).FirstOrDefaultAsync(r => r.Id == id) ?? throw ApiException.NotFound("REVIEW_NOT_FOUND");
        if (review.UserId != user.Id) throw ApiException.Forbidden("NOT_YOUR_REVIEW");
        review.Rating = req.Rating!.Value;
        review.Comment = req.Comment?.Trim() ?? "";
        review.UpdatedAt = clock.UtcNow;
        await Db.SaveChangesAsync();
        return map.Review(review, user.Id);
    }

    /// <summary>შეფასების წაშლა (ავტორს ან ადმინს).</summary>
    [HttpDelete("api/reviews/{id:int}")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(int id)
    {
        var user = await CurrentUserAsync();
        var review = await Db.Reviews.FirstOrDefaultAsync(r => r.Id == id) ?? throw ApiException.NotFound("REVIEW_NOT_FOUND");
        if (review.UserId != user.Id && user.Role != UserRole.Admin) throw ApiException.Forbidden("NOT_YOUR_REVIEW");
        Db.Reviews.Remove(review);
        await Db.SaveChangesAsync();
        return NoContent();
    }

    private void Validate(ReviewRequest req) =>
        NewValidator().Required("rating", req.Rating).Range("rating", req.Rating, 1, 5).MaxLength("comment", req.Comment, 1000).ThrowIfInvalid();

    private async Task EnsureBookAsync(int bookId)
    {
        if (!await Db.Books.AnyAsync(b => b.Id == bookId && b.IsPublished)) throw ApiException.NotFound("BOOK_NOT_FOUND");
    }
}
