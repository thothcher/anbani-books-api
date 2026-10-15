using BooksApi.Data;

namespace BooksApi.Contracts;

public sealed record PlanDto(
    int Id,
    string Code,
    string Name,
    string Description,
    decimal Price,
    string Currency,
    string Interval,
    int TrialDays,
    bool AllowDownload,
    bool IsPopular,
    decimal MonthlyPrice,
    string[] Features);

public sealed record CardDto(string Brand, string Last4, int ExpMonth, int ExpYear, string HolderName);

public sealed class SubscriptionDto
{
    /// <summary>none | trialing | active | canceled | expired</summary>
    public string Status { get; init; } = "none";
    public PlanDto? Plan { get; init; }
    public bool IsTrial { get; init; }
    public bool IsComplimentary { get; init; }
    public bool HasAccess { get; init; }
    public bool CanDownload { get; init; }
    public bool CanStartTrial { get; init; }
    public bool HasUsedTrial { get; init; }
    public DateTime? StartedAt { get; init; }
    public DateTime? CurrentPeriodStart { get; init; }
    public DateTime? CurrentPeriodEnd { get; init; }
    public DateTime? TrialEndsAt { get; init; }
    public bool CancelAtPeriodEnd { get; init; }
    public DateTime? CanceledAt { get; init; }
    public DateTime? EndedAt { get; init; }
    /// <summary>Until when the user can read (null without access).</summary>
    public DateTime? AccessUntil { get; init; }
    /// <summary>When the saved card will be charged next (null if it won't be).</summary>
    public DateTime? RenewsAt { get; init; }
    public int DaysLeft { get; init; }
    public CardDto? PaymentMethod { get; init; }
    /// <summary>"Now" for this user — differs from real time after sandbox time travel.</summary>
    public DateTime Now { get; init; }
}

public sealed record TrialRequest(int? PlanId);

public sealed record CardRequest(string? Number, string? HolderName, int? ExpMonth, int? ExpYear, string? Cvc);

public sealed record CheckoutRequest(int? PlanId, CardRequest? Card);

public sealed record ChangePlanRequest(int? PlanId);

public sealed record PaymentMethodRequest(CardRequest? Card);

public sealed record PaymentDto(
    int Id,
    string InvoiceNumber,
    decimal Amount,
    string Currency,
    PaymentStatus Status,
    PaymentKind Kind,
    string Description,
    string? PlanCode,
    string? PlanName,
    string? FailureCode,
    string? FailureMessage,
    string? CardBrand,
    string? CardLast4,
    DateTime? PeriodStart,
    DateTime? PeriodEnd,
    DateTime CreatedAt);

public sealed record CheckoutResponse(SubscriptionDto Subscription, PaymentDto Payment);

public sealed record TestCardDto(string Number, string Brand, string Behavior, string Description);
