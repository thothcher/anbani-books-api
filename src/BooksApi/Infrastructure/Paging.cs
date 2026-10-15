namespace BooksApi.Infrastructure;

/// <summary>Every list endpoint returns this envelope.</summary>
public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalItems, int TotalPages, bool HasMore)
{
    public static PagedResult<T> Create(IReadOnlyList<T> items, int page, int pageSize, int total) =>
        new(items, page, pageSize, total, total == 0 ? 0 : (int)Math.Ceiling(total / (double)pageSize), page * pageSize < total);
}

public static class Paging
{
    /// <summary>Validates page/pageSize query parameters (1-based page, pageSize 1..max).</summary>
    public static (int Page, int PageSize) Read(Validator v, int? page, int? pageSize, int defaultSize = 12, int max = 48)
    {
        v.Range("page", page, 1, 100000);
        v.Range("pageSize", pageSize, 1, max);
        return (page ?? 1, pageSize ?? defaultSize);
    }
}
