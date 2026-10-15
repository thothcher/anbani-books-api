using BooksApi.Data;

namespace BooksApi.Contracts;

public sealed record AdminUserDto(
    int Id,
    string FirstName,
    string LastName,
    string Email,
    UserRole Role,
    bool IsVerified,
    string? AvatarUrl,
    DateTime CreatedAt,
    DateTime? LastLoginAt,
    SubscriptionSummaryDto Subscription,
    int BooksStarted,
    decimal TotalSpent,
    bool IsDemoAccount);

public sealed record AdminPaymentDto(
    int Id,
    string InvoiceNumber,
    decimal Amount,
    string Currency,
    PaymentStatus Status,
    PaymentKind Kind,
    string Description,
    string? FailureCode,
    string? CardBrand,
    string? CardLast4,
    DateTime CreatedAt,
    int UserId,
    string UserName,
    string UserEmail);

public sealed record RoleRequest(string? Role);

public sealed record GrantRequest(int? PlanId, int? Days);

public sealed record CountPoint(DateOnly Date, int Value);

public sealed record MoneyPoint(DateOnly Date, decimal Value);

public sealed record TopBookDto(int Id, string Title, string Author, string CoverUrl, int Readers);

public sealed record AdminStatsDto(
    AdminUserStats Users,
    AdminSubscriptionStats Subscriptions,
    AdminRevenueStats Revenue,
    AdminBookStats Books,
    AdminReadingStats Reading,
    IReadOnlyList<CountPoint> Signups,
    IReadOnlyList<MoneyPoint> RevenueByDay,
    IReadOnlyList<TopBookDto> TopBooks);

public sealed record AdminUserStats(int Total, int Verified, int Admins, int NewLast7Days);

public sealed record AdminSubscriptionStats(int None, int Trialing, int Active, int Canceled, int Expired);

public sealed record AdminRevenueStats(string Currency, decimal Total, decimal Last30Days, decimal Mrr, int FailedPayments);

public sealed record AdminBookStats(int Total, int Published, int Drafts, int Custom);

public sealed record AdminReadingStats(int ActiveReaders7d, int PagesRead30d, int Reviews);

// ── sandbox / developer / teacher ──────────────────────────────────────────

public sealed record InboxEmailDto(int Id, string To, string Subject, string Type, string? Code, string Preview, string Text, string Html, DateTime CreatedAt);

public sealed record TimeTravelRequest(int? Days);

public sealed record ClockDto(DateTime ServerTime, DateTime UserTime, int OffsetDays);

public sealed record CreateApiKeyRequest(string? Name, string? Email, string? Group);

public sealed record ApiKeyCreatedDto(string ApiKey, string Name, string? Email, string? Group, DateTime CreatedAt, string Note);

public sealed record ApiKeyInfoDto(string Name, string? Email, string? Group, bool IsDemo, DateTime CreatedAt, DateTime? LastUsedAt, long RequestCount, int Users, int CustomBooks, long StorageBytes);

public sealed record TeacherKeyDto(
    int Id,
    string Name,
    string? Email,
    string? Group,
    string KeyPreview,
    bool IsActive,
    bool IsDemo,
    DateTime CreatedAt,
    DateTime? LastUsedAt,
    long RequestCount,
    long ErrorCount,
    int Users,
    int Subscriptions,
    int CustomBooks,
    int Reviews,
    IReadOnlyList<TeacherEndpointDto> Endpoints);

public sealed record TeacherEndpointDto(string Endpoint, long Count, long ErrorCount, DateTime LastAt);

public sealed record TeacherKeyUpdate(bool? IsActive);
