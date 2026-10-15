using System.Collections.Concurrent;
using BooksApi.Data;
using Microsoft.EntityFrameworkCore;

namespace BooksApi.Infrastructure;

/// <summary>
/// Counts requests per API key and endpoint in memory and writes them to the database every few seconds.
/// The teacher dashboard uses it to see which parts of the API each student has already integrated.
/// </summary>
public sealed class UsageTracker
{
    private sealed class Counter { public long Count; public long Errors; public DateTime LastAt; }

    private ConcurrentDictionary<(int KeyId, string Endpoint), Counter> pending = new();

    public void Record(int keyId, string? endpoint, int status)
    {
        var c = pending.GetOrAdd((keyId, endpoint ?? "(unknown route)"), _ => new Counter());
        Interlocked.Increment(ref c.Count);
        if (status >= 400) Interlocked.Increment(ref c.Errors);
        c.LastAt = DateTime.UtcNow;
    }

    public async Task FlushAsync(AppDbContext db, CancellationToken ct = default)
    {
        var batch = Interlocked.Exchange(ref pending, new ConcurrentDictionary<(int KeyId, string Endpoint), Counter>());
        if (batch.IsEmpty) return;

        foreach (var group in batch.GroupBy(x => x.Key.KeyId))
        {
            var key = await db.ApiKeys.FirstOrDefaultAsync(k => k.Id == group.Key, ct);
            if (key is null) continue;
            key.RequestCount += group.Sum(x => x.Value.Count);
            key.ErrorCount += group.Sum(x => x.Value.Errors);
            key.LastUsedAt = group.Max(x => x.Value.LastAt);

            var names = group.Select(x => x.Key.Endpoint).ToList();
            var stats = await db.ApiKeyEndpointStats.Where(s => s.ApiKeyId == group.Key && names.Contains(s.Endpoint)).ToListAsync(ct);
            foreach (var (k, c) in group)
            {
                var stat = stats.FirstOrDefault(s => s.Endpoint == k.Endpoint);
                if (stat is null)
                {
                    stat = new ApiKeyEndpointStat { ApiKeyId = k.KeyId, Endpoint = k.Endpoint };
                    db.ApiKeyEndpointStats.Add(stat);
                }
                stat.Count += c.Count;
                stat.ErrorCount += c.Errors;
                stat.LastAt = c.LastAt;
            }
        }
        await db.SaveChangesAsync(ct);
    }
}

public sealed class UsageFlushService(IServiceScopeFactory scopes, UsageTracker tracker, ILogger<UsageFlushService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(15));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopes.CreateScope();
                await tracker.FlushAsync(scope.ServiceProvider.GetRequiredService<AppDbContext>(), stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Could not save API usage statistics");
            }
        }
    }
}
