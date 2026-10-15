using BooksApi.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace BooksApi.Infrastructure;

/// <summary>
/// Every /api request must carry <c>X-API-KEY</c>. The key selects the student's sandbox
/// (TenantContext), so two students can register the same e-mail without seeing each other.
/// </summary>
public sealed class ApiKeyMiddleware(RequestDelegate next, IMemoryCache cache, UsageTracker usage)
{
    public const string Header = "X-API-KEY";

    private static readonly string[] OpenPrefixes = ["/api/developer/keys", "/api/teacher"];

    public async Task InvokeAsync(HttpContext http, AppDbContext db, TenantContext tenant)
    {
        var path = http.Request.Path.Value ?? "";
        if (!path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase) && !path.Equals("/api", StringComparison.OrdinalIgnoreCase)
            || OpenPrefixes.Any(p => path.StartsWith(p, StringComparison.OrdinalIgnoreCase)))
        {
            await next(http);
            return;
        }

        var value = http.Request.Headers[Header].ToString().Trim();
        if (string.IsNullOrEmpty(value))
        {
            await Problem.WriteAsync(http, 401, "API_KEY_MISSING");
            return;
        }

        var key = await cache.GetOrCreateAsync($"apikey:{value}", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(60);
            return await db.ApiKeys.AsNoTracking().FirstOrDefaultAsync(k => k.Key == value);
        });
        if (key is null)
        {
            await Problem.WriteAsync(http, 401, "API_KEY_INVALID");
            return;
        }
        if (!key.IsActive)
        {
            await Problem.WriteAsync(http, 403, "API_KEY_DISABLED");
            return;
        }

        tenant.Set(key);
        try
        {
            await next(http);
        }
        finally
        {
            var endpoint = (http.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText;
            usage.Record(key.Id, endpoint is null ? null : $"{http.Request.Method} /{endpoint.TrimStart('/')}", http.Response.StatusCode);
        }
    }

    public static void Forget(IMemoryCache cache, string key) => cache.Remove($"apikey:{key}");
}
