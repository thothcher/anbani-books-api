using System.Security.Cryptography;
using System.Text;
using BooksApi.Contracts;
using BooksApi.Data;
using BooksApi.Infrastructure;
using BooksApi.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace BooksApi.Controllers;

/// <summary>API keys for students (the developer portal at "/" uses these).</summary>
[Route("api/developer")]
[Tags("Developer")]
public sealed class DeveloperController(IOptions<SandboxOptions> options, FileStorage storage, IClock clock) : ApiControllerBase
{
    /// <summary>ახალი API გასაღების შექმნა (X-API-KEY არ სჭირდება). გასაღები ერთხელ ჩანს — შეინახეთ!</summary>
    [HttpPost("keys")]
    [EnableRateLimiting("keys")]
    [ProducesResponseType<ApiKeyCreatedDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> CreateKey(CreateApiKeyRequest req)
    {
        if (!options.Value.AllowSelfServiceKeys) throw ApiException.Forbidden("SELF_SERVICE_DISABLED");
        var key = await KeyFactory.CreateAsync(Db, NewValidator(), req, clock.UtcNow);
        return StatusCode(201, KeyFactory.Created(key, Lang));
    }

    /// <summary>ინფორმაცია მიმდინარე API გასაღებზე (X-API-KEY) და მის sandbox-ზე.</summary>
    [HttpGet("me")]
    public async Task<ApiKeyInfoDto> Me()
    {
        var key = Tenant.Key!;
        var fresh = await Db.ApiKeys.AsNoTracking().FirstAsync(k => k.Id == key.Id);
        return new ApiKeyInfoDto(fresh.Name, fresh.Email, fresh.Group, fresh.IsDemo, fresh.CreatedAt, fresh.LastUsedAt, fresh.RequestCount,
            await Db.Users.CountAsync(), await Db.Books.CountAsync(b => b.TenantId == key.Id), storage.TenantUsage(key.Id));
    }
}

/// <summary>For the teacher: every sandbox and what its owner has built so far. Header: X-Teacher-Secret.</summary>
[Route("api/teacher")]
[Tags("Teacher")]
public sealed class TeacherController(IOptions<TeacherOptions> teacher, IMemoryCache cache, FileStorage storage, Seeder seeder, IClock clock) : ApiControllerBase
{
    /// <summary>ყველა API გასაღები გამოყენების სტატისტიკით (რომელ endpoint-ს რამდენჯერ იძახებს სტუდენტი).</summary>
    [HttpGet("keys")]
    public async Task<List<TeacherKeyDto>> Keys()
    {
        Authorize();
        var keys = await Db.ApiKeys.AsNoTracking().OrderByDescending(k => k.LastUsedAt).ThenByDescending(k => k.Id).ToListAsync();
        var stats = await Db.ApiKeyEndpointStats.AsNoTracking().ToListAsync();
        var users = await Db.Users.IgnoreQueryFilters().GroupBy(u => u.TenantId).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count);
        var subs = await Db.Subscriptions.IgnoreQueryFilters().GroupBy(s => s.TenantId).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count);
        var books = await Db.Books.IgnoreQueryFilters().Where(b => b.TenantId != null).GroupBy(b => b.TenantId!.Value).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count);
        var reviews = await Db.Reviews.IgnoreQueryFilters().GroupBy(r => r.TenantId).Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count);
        return keys.Select(k => ToDto(k, stats, users, subs, books, reviews)).ToList();
    }

    /// <summary>გასაღების შექმნა ლექტორის მიერ (მუშაობს მაშინაც, როცა თვითრეგისტრაცია გათიშულია).</summary>
    [HttpPost("keys")]
    [ProducesResponseType<ApiKeyCreatedDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> CreateKey(CreateApiKeyRequest req)
    {
        Authorize();
        var key = await KeyFactory.CreateAsync(Db, NewValidator(), req, clock.UtcNow);
        return StatusCode(201, KeyFactory.Created(key, Lang));
    }

    /// <summary>გასაღების ჩართვა/გათიშვა.</summary>
    [HttpPatch("keys/{id:int}")]
    public async Task<IActionResult> UpdateKey(int id, TeacherKeyUpdate req)
    {
        Authorize();
        var key = await Db.ApiKeys.FirstOrDefaultAsync(k => k.Id == id) ?? throw ApiException.NotFound("NOT_FOUND");
        if (req.IsActive is { } active) key.IsActive = active;
        await Db.SaveChangesAsync();
        ApiKeyMiddleware.Forget(cache, key.Key);
        return NoContent();
    }

    /// <summary>sandbox-ის მონაცემების წაშლა (მომხმარებლები, წიგნები, გადახდები...). გასაღები რჩება.</summary>
    [HttpDelete("keys/{id:int}/data")]
    public async Task<IActionResult> WipeKey(int id)
    {
        Authorize();
        var key = await Db.ApiKeys.FirstOrDefaultAsync(k => k.Id == id) ?? throw ApiException.NotFound("NOT_FOUND");
        await seeder.WipeTenantAsync(key.Id);
        storage.DeleteTenant(key.Id);
        if (key.IsDemo) await seeder.SeedDemoTenantAsync(key);
        return NoContent();
    }

    private void Authorize()
    {
        var secret = teacher.Value.Secret;
        var given = Request.Headers["X-Teacher-Secret"].ToString();
        if (string.IsNullOrEmpty(secret)) throw ApiException.NotFound("NOT_FOUND");
        if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(given)))
            throw new ApiException(401, "TEACHER_SECRET_INVALID");
    }

    private static TeacherKeyDto ToDto(ApiKey k, List<ApiKeyEndpointStat> stats, Dictionary<int, int> users, Dictionary<int, int> subs,
        Dictionary<int, int> books, Dictionary<int, int> reviews) => new(
        k.Id, k.Name, k.Email, k.Group, k.Key.Length > 12 ? k.Key[..8] + "…" + k.Key[^4..] : k.Key, k.IsActive, k.IsDemo, k.CreatedAt, k.LastUsedAt,
        k.RequestCount, k.ErrorCount, users.GetValueOrDefault(k.Id), subs.GetValueOrDefault(k.Id), books.GetValueOrDefault(k.Id), reviews.GetValueOrDefault(k.Id),
        stats.Where(s => s.ApiKeyId == k.Id).OrderByDescending(s => s.Count).Select(s => new TeacherEndpointDto(s.Endpoint, s.Count, s.ErrorCount, s.LastAt)).ToList());
}

internal static class KeyFactory
{
    public static async Task<ApiKey> CreateAsync(AppDbContext db, Validator v, CreateApiKeyRequest req, DateTime now)
    {
        v.Required("name", req.Name).Length("name", req.Name, 2, 60).Email("email", req.Email).MaxLength("group", req.Group, 40).ThrowIfInvalid();
        var key = new ApiKey
        {
            Key = "anb_" + Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant(),
            Name = req.Name!.Trim(),
            Email = string.IsNullOrWhiteSpace(req.Email) ? null : req.Email.Trim(),
            Group = string.IsNullOrWhiteSpace(req.Group) ? null : req.Group.Trim(),
            CreatedAt = now,
        };
        db.ApiKeys.Add(key);
        await db.SaveChangesAsync();
        return key;
    }

    public static ApiKeyCreatedDto Created(ApiKey key, Lang lang) => new(key.Key, key.Name, key.Email, key.Group, key.CreatedAt,
        lang.Pick(
            "შეინახეთ ეს გასაღები და გამოგზავნეთ ყველა მოთხოვნაში ჰედერით X-API-KEY. მისი თავიდან ნახვა შეუძლებელია.",
            "Save this key and send it with every request in the X-API-KEY header. It can't be shown again."));
}
