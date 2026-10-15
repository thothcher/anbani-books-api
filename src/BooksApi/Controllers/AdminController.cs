using BooksApi.Contracts;
using BooksApi.Data;
using BooksApi.Infrastructure;
using BooksApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BooksApi.Controllers;

/// <summary>
/// The admin panel of a sandbox: dashboard numbers, users, payments.
/// (Books and categories are managed through /api/books and /api/categories.)
/// </summary>
[Route("api/admin")]
[Tags("Admin")]
[Authorize]
public sealed class AdminController(
    SubscriptionService subscriptions,
    Catalog catalog,
    DtoMapper map,
    Urls urls,
    FileStorage storage,
    IClock clock) : ApiControllerBase
{
    /// <summary>დაფის სტატისტიკა: მომხმარებლები, გამოწერები, შემოსავალი, ბოლო 14 დღის გრაფიკები.</summary>
    [HttpGet("stats")]
    public async Task<AdminStatsDto> Stats()
    {
        await AdminAsync();
        var now = clock.UtcNow;
        var users = await Db.Users.Select(u => new { u.Id, u.IsVerified, u.Role, u.CreatedAt }).ToListAsync();
        var subs = await Db.Subscriptions.Include(s => s.Plan).ToListAsync();
        var payments = await Db.Payments.Select(p => new { p.AmountMinor, p.Status, p.CreatedAt, p.Currency }).ToListAsync();

        string StatusOf(Subscription s) =>
            s.Status != SubscriptionStatus.Expired && s.CurrentPeriodEnd <= now ? "expired" : s.Status.ToString().ToLowerInvariant();
        var byStatus = subs.GroupBy(StatusOf).ToDictionary(g => g.Key, g => g.Count());

        var succeeded = payments.Where(p => p.Status == PaymentStatus.Succeeded).ToList();
        var mrrMinor = subs.Where(s => StatusOf(s) == "active" && !s.IsTrial && !s.IsComplimentary)
            .Sum(s => s.Plan.Interval == "year" ? s.Plan.PriceMinor / 12m : s.Plan.PriceMinor);

        var books = await Db.Books.Select(b => new { b.Id, b.IsPublished, b.TenantId }).ToListAsync();
        var since7 = DateOnly.FromDateTime(now.AddDays(-7));
        var since30 = DateOnly.FromDateTime(now.AddDays(-30));
        var logs = await Db.ReadingLogs.Where(l => l.Day >= since30).ToListAsync();

        var days = Enumerable.Range(0, 14).Select(i => DateOnly.FromDateTime(now.AddDays(i - 13))).ToList();
        var signups = days.Select(d => new CountPoint(d, users.Count(u => DateOnly.FromDateTime(u.CreatedAt) == d))).ToList();
        var revenue = days.Select(d => new MoneyPoint(d, DtoMapper.Money(succeeded.Where(p => DateOnly.FromDateTime(p.CreatedAt) == d).Sum(p => p.AmountMinor)))).ToList();

        var published = await Db.Books.Include(b => b.Category).Where(b => b.IsPublished).ToListAsync();
        var readers = await catalog.ReaderCountsAsync(published.Select(b => b.Id).ToList());
        var top = published.OrderByDescending(b => b.SeedReaders + readers.GetValueOrDefault(b.Id)).Take(5)
            .Select(b => new TopBookDto(b.Id, b.Title, b.Author, urls.Cover(b), b.SeedReaders + readers.GetValueOrDefault(b.Id))).ToList();

        return new AdminStatsDto(
            new AdminUserStats(users.Count, users.Count(u => u.IsVerified), users.Count(u => u.Role == UserRole.Admin), users.Count(u => u.CreatedAt >= now.AddDays(-7))),
            new AdminSubscriptionStats(users.Count - subs.Count, byStatus.GetValueOrDefault("trialing"), byStatus.GetValueOrDefault("active"),
                byStatus.GetValueOrDefault("canceled"), byStatus.GetValueOrDefault("expired")),
            new AdminRevenueStats("GEL", DtoMapper.Money(succeeded.Sum(p => p.AmountMinor)),
                DtoMapper.Money(succeeded.Where(p => p.CreatedAt >= now.AddDays(-30)).Sum(p => p.AmountMinor)),
                Math.Round(mrrMinor / 100m, 2), payments.Count(p => p.Status == PaymentStatus.Failed)),
            new AdminBookStats(books.Count, books.Count(b => b.IsPublished), books.Count(b => !b.IsPublished), books.Count(b => b.TenantId is not null)),
            new AdminReadingStats(logs.Where(l => l.Day >= since7).Select(l => l.UserId).Distinct().Count(), logs.Sum(l => l.Pages), await Db.Reviews.CountAsync()),
            signups, revenue, top);
    }

    /// <summary>მომხმარებლების სია. ფილტრები: q (სახელი/ელ-ფოსტა), role (user|admin), status (none|trialing|active|canceled|expired).</summary>
    [HttpGet("users")]
    public async Task<PagedResult<AdminUserDto>> Users(string? q, string? role, string? status, int? page, int? pageSize)
    {
        var v = NewValidator().OneOf("role", role, "user", "admin").OneOf("status", status, "none", "trialing", "active", "canceled", "expired");
        var (p, size) = Paging.Read(v, page, pageSize, defaultSize: 20, max: 100);
        v.ThrowIfInvalid();
        await AdminAsync();

        var query = Db.Users.Include(u => u.Subscription).ThenInclude(s => s!.Plan).AsQueryable();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLower();
            query = query.Where(u => u.NormalizedEmail.Contains(term) || (u.FirstName + " " + u.LastName).ToLower().Contains(term));
        }
        if (role is not null) query = query.Where(u => u.Role == (role == "admin" ? UserRole.Admin : UserRole.User));
        var all = await query.OrderByDescending(u => u.CreatedAt).ToListAsync();
        var rows = all.Select(u => (User: u, State: subscriptions.Describe(u, u.Subscription))).ToList();
        if (status is not null) rows = rows.Where(r => EffectiveStatus(r.State, r.User.Subscription) == status).ToList();

        var pageRows = rows.Skip((p - 1) * size).Take(size).ToList();
        var ids = pageRows.Select(r => r.User.Id).ToList();
        var started = await Db.ReadingProgress.Where(x => ids.Contains(x.UserId)).GroupBy(x => x.UserId).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count);
        var spent = await Db.Payments.Where(x => ids.Contains(x.UserId) && x.Status == PaymentStatus.Succeeded).GroupBy(x => x.UserId).Select(g => new { g.Key, Sum = g.Sum(x => x.AmountMinor) }).ToDictionaryAsync(x => x.Key, x => x.Sum);

        var items = pageRows.Select(r => ToDto(r.User, r.State, started.GetValueOrDefault(r.User.Id), spent.GetValueOrDefault(r.User.Id))).ToList();
        return PagedResult<AdminUserDto>.Create(items, p, size, rows.Count);
    }

    /// <summary>ერთი მომხმარებელი.</summary>
    [HttpGet("users/{id:int}")]
    public async Task<AdminUserDto> GetUser(int id)
    {
        await AdminAsync();
        return await UserDtoAsync(await FindUserAsync(id));
    }

    /// <summary>როლის შეცვლა: "user" ან "admin".</summary>
    [HttpPut("users/{id:int}/role")]
    public async Task<AdminUserDto> SetRole(int id, RoleRequest req)
    {
        NewValidator().Required("role", req.Role).OneOf("role", req.Role, "user", "admin").ThrowIfInvalid();
        var admin = await AdminAsync();
        var user = await FindUserAsync(id);
        if (user.Id == admin.Id) throw ApiException.Conflict("CANNOT_CHANGE_SELF");
        if (user.IsDemoAccount) throw ApiException.Forbidden("DEMO_ACCOUNT_LOCKED");
        user.Role = req.Role!.Equals("admin", StringComparison.OrdinalIgnoreCase) ? UserRole.Admin : UserRole.User;
        user.UpdatedAt = clock.UtcNow;
        await Db.SaveChangesAsync();
        return await UserDtoAsync(user);
    }

    /// <summary>უფასო წვდომის მინიჭება (მაგ. მომხმარებელთა მხარდაჭერისთვის): planId და days (1–365).</summary>
    [HttpPost("users/{id:int}/grant")]
    public async Task<SubscriptionDto> Grant(int id, GrantRequest req)
    {
        NewValidator().Required("planId", req.PlanId).Required("days", req.Days).Range("days", req.Days, 1, 365).ThrowIfInvalid();
        await AdminAsync();
        var user = await FindUserAsync(id);
        var plan = await Db.Plans.FirstOrDefaultAsync(p => p.Id == req.PlanId) ?? throw ApiException.NotFound("PLAN_NOT_FOUND");
        var sub = await subscriptions.GrantAsync(user, plan, req.Days!.Value);
        return map.Subscription(user, sub, subscriptions.Describe(user, sub));
    }

    /// <summary>მომხმარებლის წაშლა.</summary>
    [HttpDelete("users/{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> DeleteUser(int id)
    {
        var admin = await AdminAsync();
        var user = await FindUserAsync(id);
        if (user.Id == admin.Id) throw ApiException.Conflict("CANNOT_CHANGE_SELF");
        if (user.IsDemoAccount) throw ApiException.Forbidden("DEMO_ACCOUNT_LOCKED");
        storage.Delete(user.AvatarFile);
        await Db.Reviews.Where(r => r.UserId == user.Id).ExecuteDeleteAsync();
        await Db.Payments.Where(p => p.UserId == user.Id).ExecuteDeleteAsync();
        Db.Users.Remove(user);
        await Db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>ყველა გადახდა sandbox-ში. status: succeeded | failed</summary>
    [HttpGet("payments")]
    public async Task<PagedResult<AdminPaymentDto>> Payments(string? status, int? page, int? pageSize)
    {
        var v = NewValidator().OneOf("status", status, "succeeded", "failed");
        var (p, size) = Paging.Read(v, page, pageSize, defaultSize: 20, max: 100);
        v.ThrowIfInvalid();
        await AdminAsync();
        var query = Db.Payments.Include(x => x.Plan).Include(x => x.User).AsQueryable();
        if (status is not null) query = query.Where(x => x.Status == (status == "failed" ? PaymentStatus.Failed : PaymentStatus.Succeeded));
        query = query.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id);
        var total = await query.CountAsync();
        var items = await query.Skip((p - 1) * size).Take(size).ToListAsync();
        return PagedResult<AdminPaymentDto>.Create(items.Select(x =>
        {
            var d = map.Payment(x);
            return new AdminPaymentDto(d.Id, d.InvoiceNumber, d.Amount, d.Currency, d.Status, d.Kind, d.Description, d.FailureCode,
                d.CardBrand, d.CardLast4, d.CreatedAt, x.UserId, $"{x.User.FirstName} {x.User.LastName}", x.User.Email);
        }).ToList(), p, size, total);
    }

    private async Task<User> FindUserAsync(int id) =>
        await Db.Users.Include(u => u.Subscription).ThenInclude(s => s!.Plan).FirstOrDefaultAsync(u => u.Id == id)
        ?? throw ApiException.NotFound("USER_NOT_FOUND");

    private async Task<AdminUserDto> UserDtoAsync(User user)
    {
        var sub = await subscriptions.LoadAsync(user);
        var started = await Db.ReadingProgress.CountAsync(x => x.UserId == user.Id);
        var spent = await Db.Payments.Where(x => x.UserId == user.Id && x.Status == PaymentStatus.Succeeded).SumAsync(x => x.AmountMinor);
        return ToDto(user, subscriptions.Describe(user, sub), started, spent);
    }

    private AdminUserDto ToDto(User u, SubscriptionState state, int started, int spentMinor) => new(
        u.Id, u.FirstName, u.LastName, u.Email, u.Role, u.IsVerified, urls.Avatar(u), u.CreatedAt, u.LastLoginAt,
        map.Summary(state with { Status = EffectiveStatus(state, u.Subscription) }, u.Subscription), started, DtoMapper.Money(spentMinor), u.IsDemoAccount);

    /// <summary>Lists don't run renewals for every user, so a period that already ended is shown as expired.</summary>
    private static string EffectiveStatus(SubscriptionState state, Subscription? sub) =>
        sub is not null && state.Status is "trialing" or "active" or "canceled" && !state.HasAccess ? "expired" : state.Status;
}
