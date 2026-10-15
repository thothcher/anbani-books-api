using BooksApi.Data;

namespace BooksApi.Infrastructure;

/// <summary>Per-request: which sandbox (API key) is calling. Set by <see cref="ApiKeyMiddleware"/>.</summary>
public sealed class TenantContext
{
    public int? TenantId { get; private set; }
    public ApiKey? Key { get; private set; }

    public void Set(ApiKey key)
    {
        Key = key;
        TenantId = key.Id;
    }

    /// <summary>Used by background jobs and the seeder.</summary>
    public void Use(int tenantId) => TenantId = tenantId;

    public int Require() => TenantId ?? throw new InvalidOperationException("No tenant for this request.");
}
