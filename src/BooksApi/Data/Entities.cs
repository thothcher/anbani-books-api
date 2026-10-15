namespace BooksApi.Data;

// ─────────────────────────────────────────────────────────────────────────────
// Multi-tenancy in one sentence: every student gets an API key, and everything
// their app creates (users, subscriptions, reviews, their own books…) is stored
// with TenantId = that key's id. Built-in demo content has TenantId = null and is
// visible in every sandbox. AppDbContext applies the filter automatically.
// ─────────────────────────────────────────────────────────────────────────────

public enum UserRole { User, Admin }

/// <summary>"None" is not stored: a user without a Subscription row has no subscription.</summary>
public enum SubscriptionStatus { Trialing, Active, Canceled, Expired }

public enum PaymentStatus { Succeeded, Failed }

public enum PaymentKind { Subscription, Renewal, PlanChange, Complimentary }

public enum CodePurpose { EmailVerification, PasswordReset }

public enum ReadingStatus { Reading, Finished }

/// <summary>A student's sandbox. The key goes in the X-API-KEY header.</summary>
public class ApiKey
{
    public int Id { get; set; }
    public string Key { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Email { get; set; }
    public string? Group { get; set; }
    public bool IsActive { get; set; } = true;
    /// <summary>The key used by the reference website. Its demo accounts are protected.</summary>
    public bool IsDemo { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? LastUsedAt { get; set; }
    public long RequestCount { get; set; }
    public long ErrorCount { get; set; }
}

/// <summary>How often a sandbox called each endpoint — lets the teacher see which features a student built.</summary>
public class ApiKeyEndpointStat
{
    public int Id { get; set; }
    public int ApiKeyId { get; set; }
    public string Endpoint { get; set; } = "";
    public long Count { get; set; }
    public long ErrorCount { get; set; }
    public DateTime LastAt { get; set; }
}

public class User
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string Email { get; set; } = "";
    public string NormalizedEmail { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public UserRole Role { get; set; }
    public bool IsVerified { get; set; }
    public DateTime? VerifiedAt { get; set; }
    public string? Phone { get; set; }
    public string? Bio { get; set; }
    public string? AvatarFile { get; set; }
    public string? AvatarKey { get; set; }
    /// <summary>Sandbox "time travel": this user's clock runs this many days ahead.</summary>
    public int ClockOffsetDays { get; set; }
    public bool HasUsedTrial { get; set; }
    /// <summary>Seeded demo accounts can't be deleted or have their password changed.</summary>
    public bool IsDemoAccount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? LastLoginAt { get; set; }

    public Subscription? Subscription { get; set; }
}

public class RefreshToken
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User User { get; set; } = null!;
    public string TokenHash { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
}

public class VerificationCode
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User User { get; set; } = null!;
    public CodePurpose Purpose { get; set; }
    public string CodeHash { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public int Attempts { get; set; }
    public DateTime? ConsumedAt { get; set; }
}

public class Category
{
    public int Id { get; set; }
    /// <summary>null = built-in category, visible to every sandbox and read-only.</summary>
    public int? TenantId { get; set; }
    public string Name { get; set; } = "";
    public string? NameEn { get; set; }
    public string Slug { get; set; } = "";
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public List<Book> Books { get; set; } = [];
}

public class Book
{
    public int Id { get; set; }
    /// <summary>null = built-in demo book (read-only). Otherwise created by an admin of that sandbox.</summary>
    public int? TenantId { get; set; }
    /// <summary>Stable id of built-in books (used by the seeder).</summary>
    public string? Slug { get; set; }
    public string Title { get; set; } = "";
    public string Author { get; set; } = "";
    public string? Translator { get; set; }
    public string Description { get; set; } = "";
    public string? DescriptionEn { get; set; }
    public int CategoryId { get; set; }
    public Category Category { get; set; } = null!;
    public string Language { get; set; } = "ka";
    public int? Year { get; set; }
    public string? YearLabel { get; set; }
    public string? YearLabelEn { get; set; }
    public int Pages { get; set; }
    public int PreviewPages { get; set; }
    public int Words { get; set; }
    public int ReadingMinutes { get; set; }
    public bool IsFree { get; set; }
    public bool IsPublished { get; set; }
    /// <summary>Comma separated.</summary>
    public string Tags { get; set; } = "";
    /// <summary>JSON array of { title, page, level } — the table of contents.</summary>
    public string? ChaptersJson { get; set; }
    /// <summary>"seed:dracula.pdf" for built-in files, otherwise a path relative to the storage root.</summary>
    public string? PdfFile { get; set; }
    public long PdfSize { get; set; }
    public string? PreviewFile { get; set; }
    public long PreviewSize { get; set; }
    public string? CoverFile { get; set; }
    /// <summary>Public, unguessable keys used in file URLs (covers and previews need no auth).</summary>
    public string CoverKey { get; set; } = "";
    public string PreviewKey { get; set; } = "";
    /// <summary>Ratings and readers that come with the demo data, so a fresh sandbox doesn't look empty.</summary>
    public double SeedRating { get; set; }
    public int SeedRatingCount { get; set; }
    public int SeedReaders { get; set; }
    public string? SourceName { get; set; }
    public string? SourceUrl { get; set; }
    public int? CreatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? PublishedAt { get; set; }
}

public class Review
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public int BookId { get; set; }
    public Book Book { get; set; } = null!;
    public int UserId { get; set; }
    public User User { get; set; } = null!;
    public int Rating { get; set; }
    public string Comment { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class Favorite
{
    public int TenantId { get; set; }
    public int UserId { get; set; }
    public int BookId { get; set; }
    public Book Book { get; set; } = null!;
    public DateTime CreatedAt { get; set; }
}

public class ReadingProgress
{
    public int TenantId { get; set; }
    public int UserId { get; set; }
    public int BookId { get; set; }
    public Book Book { get; set; } = null!;
    public int CurrentPage { get; set; }
    public int TotalPages { get; set; }
    public ReadingStatus Status { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime LastReadAt { get; set; }
    public DateTime? FinishedAt { get; set; }
}

/// <summary>Pages read per user per day — powers the reading-activity chart.</summary>
public class ReadingLog
{
    public int TenantId { get; set; }
    public int UserId { get; set; }
    public DateOnly Day { get; set; }
    public int Pages { get; set; }
}

public class Plan
{
    public int Id { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string NameEn { get; set; } = "";
    public string Description { get; set; } = "";
    public string DescriptionEn { get; set; } = "";
    /// <summary>Money is stored in minor units (tetri): 1299 = ₾12.99. Never use float for money.</summary>
    public int PriceMinor { get; set; }
    public string Currency { get; set; } = "GEL";
    /// <summary>"month" or "year".</summary>
    public string Interval { get; set; } = "month";
    public int TrialDays { get; set; }
    public bool AllowDownload { get; set; }
    public bool IsPopular { get; set; }
    public int SortOrder { get; set; }
    /// <summary>Newline separated feature bullets.</summary>
    public string Features { get; set; } = "";
    public string FeaturesEn { get; set; } = "";
}

public class Subscription
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public int UserId { get; set; }
    public User User { get; set; } = null!;
    public int PlanId { get; set; }
    public Plan Plan { get; set; } = null!;
    public SubscriptionStatus Status { get; set; }
    /// <summary>True while the current period is the free trial.</summary>
    public bool IsTrial { get; set; }
    /// <summary>Granted by an admin, nothing was charged.</summary>
    public bool IsComplimentary { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime CurrentPeriodStart { get; set; }
    public DateTime CurrentPeriodEnd { get; set; }
    public DateTime? TrialEndsAt { get; set; }
    public bool CancelAtPeriodEnd { get; set; }
    public DateTime? CanceledAt { get; set; }
    public DateTime? EndedAt { get; set; }
    // Saved payment method. We only ever keep brand + last 4 digits — never the full number.
    public string? CardBrand { get; set; }
    public string? CardLast4 { get; set; }
    public int? CardExpMonth { get; set; }
    public int? CardExpYear { get; set; }
    public string? CardHolder { get; set; }
    /// <summary>How the saved test card behaves on future renewals (see FakePaymentGateway).</summary>
    public string? CardBehavior { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class Payment
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public int UserId { get; set; }
    public User User { get; set; } = null!;
    public int? PlanId { get; set; }
    public Plan? Plan { get; set; }
    public string InvoiceNumber { get; set; } = "";
    public int AmountMinor { get; set; }
    public string Currency { get; set; } = "GEL";
    public PaymentStatus Status { get; set; }
    public PaymentKind Kind { get; set; }
    public string? FailureCode { get; set; }
    public string? CardBrand { get; set; }
    public string? CardLast4 { get; set; }
    public DateTime? PeriodStart { get; set; }
    public DateTime? PeriodEnd { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>Sandbox inbox: every e-mail the API "sends" is stored here so students can read verification codes.</summary>
public class EmailMessage
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string ToEmail { get; set; } = "";
    public string Subject { get; set; } = "";
    public string BodyText { get; set; } = "";
    public string BodyHtml { get; set; } = "";
    public string Type { get; set; } = "";
    public string? Code { get; set; }
    public DateTime CreatedAt { get; set; }
}
