using System.Text.Json.Serialization;
using BooksApi.Data;

namespace BooksApi.Contracts;

public sealed record CategoryDto(int Id, string Name, string? NameEn, string Slug, int BookCount, bool IsSystem, bool CanEdit);

public sealed record CategoryRequest(string? Name, string? NameEn);

public sealed record CategoryRef(int Id, string Name, string Slug);

public sealed record ProgressDto(
    int CurrentPage,
    int TotalPages,
    int Percent,
    ReadingStatus Status,
    DateTime StartedAt,
    DateTime LastReadAt,
    DateTime? FinishedAt);

/// <summary>A book in lists (catalog, favorites, search results).</summary>
public class BookSummaryDto
{
    [JsonPropertyOrder(-30)] public int Id { get; set; }
    [JsonPropertyOrder(-29)] public string Title { get; set; } = "";
    [JsonPropertyOrder(-28)] public string Author { get; set; } = "";
    [JsonPropertyOrder(-27)] public string CoverUrl { get; set; } = "";
    [JsonPropertyOrder(-26)] public CategoryRef Category { get; set; } = null!;
    /// <summary>"ka" or "en".</summary>
    [JsonPropertyOrder(-25)] public string Language { get; set; } = "ka";
    /// <summary>Year of first publication. Negative = BC (The Art of War: -500).</summary>
    [JsonPropertyOrder(-24)] public int? Year { get; set; }
    [JsonPropertyOrder(-23)] public string? YearLabel { get; set; }
    [JsonPropertyOrder(-22)] public int Pages { get; set; }
    [JsonPropertyOrder(-21)] public int ReadingMinutes { get; set; }
    [JsonPropertyOrder(-20)] public double Rating { get; set; }
    [JsonPropertyOrder(-19)] public int RatingCount { get; set; }
    [JsonPropertyOrder(-18)] public int Readers { get; set; }
    [JsonPropertyOrder(-17)] public bool IsFree { get; set; }
    [JsonPropertyOrder(-16)] public bool IsNew { get; set; }
    /// <summary>null when the request is anonymous.</summary>
    [JsonPropertyOrder(-15)] public bool? IsFavorite { get; set; }
    /// <summary>null when anonymous or not started.</summary>
    [JsonPropertyOrder(-14)] public ProgressDto? Progress { get; set; }
    /// <summary>Drafts are only visible to admins.</summary>
    [JsonPropertyOrder(-13)] public bool IsPublished { get; set; }
    /// <summary>Built-in demo book (read-only).</summary>
    [JsonPropertyOrder(-12)] public bool IsSystem { get; set; }
}

public sealed record ChapterDto(string Title, int Page, int Level);

/// <summary>
/// What the current user may do with the book — so the UI can pick the right button.
/// Reason: free | trial | subscription | admin | loginRequired | subscriptionRequired | noFile
/// </summary>
public sealed record BookAccessDto(bool CanRead, bool CanDownload, bool CanPreview, string Reason);

public sealed record SourceDto(string Name, string? Url);

public sealed class BookDetailsDto : BookSummaryDto
{
    public string Description { get; set; } = "";
    public string? Translator { get; set; }
    public string[] Tags { get; set; } = [];
    public string? PreviewUrl { get; set; }
    public int PreviewPages { get; set; }
    public IReadOnlyList<ChapterDto> Chapters { get; set; } = [];
    /// <summary>{ "5": 120, "4": 40, "3": 8, "2": 2, "1": 1 }</summary>
    public Dictionary<string, int> RatingBreakdown { get; set; } = [];
    public BookAccessDto Access { get; set; } = null!;
    public bool HasPdf { get; set; }
    public bool CanEdit { get; set; }
    public SourceDto? Source { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed record FileLinkDto(string Url, DateTime ExpiresAt, string FileName, int TotalPages, int? LastPage);

public sealed record BookRequest(
    string? Title,
    string? Author,
    string? Translator,
    string? Description,
    string? DescriptionEn,
    int? CategoryId,
    string? Language,
    int? Year,
    int? Pages,
    bool? IsFree,
    bool? IsPublished,
    string[]? Tags);

public sealed record PdfUploadResponse(int Pages, int PreviewPages, long Size, string? PreviewUrl, bool PreviewGenerated);

public sealed record CoverUploadResponse(string CoverUrl);

public sealed record ReviewAuthorDto(int Id, string Name, string? AvatarUrl);

public sealed record ReviewDto(int Id, int BookId, int Rating, string Comment, DateTime CreatedAt, DateTime UpdatedAt, ReviewAuthorDto User, bool IsMine);

public sealed record ReviewRequest(int? Rating, string? Comment);

public sealed record FavoriteStateDto(int BookId, bool IsFavorite);

public sealed record ProgressRequest(int? CurrentPage);

public sealed record LibraryItemDto(BookSummaryDto Book, ProgressDto Progress);

public sealed record DayActivityDto(DateOnly Date, int Pages);

public sealed record ReadingStatsDto(
    int BooksStarted,
    int BooksFinished,
    int PagesRead,
    int Favorites,
    int CurrentStreak,
    int LongestStreak,
    IReadOnlyList<DayActivityDto> Activity);
