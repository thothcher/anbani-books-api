using System.Text.Json;
using BooksApi.Contracts;
using BooksApi.Data;
using BooksApi.Infrastructure;

namespace BooksApi.Services;

/// <summary>Entity → JSON shape. Localized texts are picked here, based on Accept-Language.</summary>
public sealed class DtoMapper(Urls urls, IHttpContextAccessor http, IClock clock)
{
    public Lang Lang => http.HttpContext.GetLang();

    public static decimal Money(int minor) => minor / 100m;

    public SubscriptionSummaryDto Summary(SubscriptionState state, Subscription? sub) =>
        new(state.Status, sub?.Plan?.Code, state.IsTrial, state.HasAccess, state.AccessUntil);

    public UserDto User(User u, SubscriptionState state, Subscription? sub) => new(
        u.Id, u.FirstName, u.LastName, $"{u.FirstName} {u.LastName}".Trim(), u.Email, u.Role, u.IsVerified,
        urls.Avatar(u), u.CreatedAt, Summary(state, sub));

    public ProfileDto Profile(User u) => new(
        u.Id, u.FirstName, u.LastName, $"{u.FirstName} {u.LastName}".Trim(), u.Email, u.Role, u.IsVerified, u.VerifiedAt,
        u.Phone, u.Bio, urls.Avatar(u), u.CreatedAt, u.UpdatedAt, u.LastLoginAt);

    public PlanDto Plan(Plan p) => new(
        p.Id, p.Code, Lang.Pick(p.Name, p.NameEn), Lang.Pick(p.Description, p.DescriptionEn),
        Money(p.PriceMinor), p.Currency, p.Interval, p.TrialDays, p.AllowDownload, p.IsPopular,
        p.Interval == "year" ? Math.Round(Money(p.PriceMinor) / 12m, 2) : Money(p.PriceMinor),
        Lang.Pick(p.Features, p.FeaturesEn).Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));

    public SubscriptionDto Subscription(User user, Subscription? s, SubscriptionState state) => new()
    {
        Status = state.Status,
        Plan = s is null ? null : Plan(s.Plan),
        IsTrial = s?.IsTrial ?? false,
        IsComplimentary = s?.IsComplimentary ?? false,
        HasAccess = state.HasAccess,
        CanDownload = state.CanDownload,
        CanStartTrial = state.CanStartTrial,
        HasUsedTrial = user.HasUsedTrial,
        StartedAt = s?.StartedAt,
        CurrentPeriodStart = s?.CurrentPeriodStart,
        CurrentPeriodEnd = s?.CurrentPeriodEnd,
        TrialEndsAt = s?.TrialEndsAt,
        CancelAtPeriodEnd = s?.CancelAtPeriodEnd ?? false,
        CanceledAt = s?.CanceledAt,
        EndedAt = s?.EndedAt,
        AccessUntil = state.AccessUntil,
        RenewsAt = state.RenewsAt,
        DaysLeft = state.DaysLeft,
        PaymentMethod = s?.CardLast4 is null ? null
            : new CardDto(s.CardBrand ?? "card", s.CardLast4, s.CardExpMonth ?? 0, s.CardExpYear ?? 0, s.CardHolder ?? ""),
        Now = state.Now,
    };

    public PaymentDto Payment(Payment p)
    {
        var plan = p.Plan is null ? "" : Lang.Pick(p.Plan.Name, p.Plan.NameEn);
        var description = (p.Kind, Lang) switch
        {
            (PaymentKind.Subscription, Lang.En) => $"{plan} subscription",
            (PaymentKind.Subscription, _) => $"{plan} — გამოწერა",
            (PaymentKind.Renewal, Lang.En) => $"{plan} — automatic renewal",
            (PaymentKind.Renewal, _) => $"{plan} — ავტომატური განახლება",
            (PaymentKind.PlanChange, Lang.En) => $"Plan change: {plan}",
            (PaymentKind.PlanChange, _) => $"გეგმის შეცვლა: {plan}",
            (PaymentKind.Complimentary, Lang.En) => $"Complimentary access ({plan})",
            _ => $"საჩუქრად მიღებული წვდომა ({plan})",
        };
        return new PaymentDto(p.Id, p.InvoiceNumber, Money(p.AmountMinor), p.Currency, p.Status, p.Kind, description,
            p.Plan?.Code, p.Plan is null ? null : plan, p.FailureCode,
            p.FailureCode is null ? null : ErrorCatalog.Get(p.FailureCode, Lang).Message,
            p.CardBrand, p.CardLast4, p.PeriodStart, p.PeriodEnd, p.CreatedAt);
    }

    public CategoryDto Category(Category c, int bookCount, bool isAdmin) =>
        new(c.Id, Lang.Pick(c.Name, c.NameEn), c.NameEn, c.Slug, bookCount, c.TenantId is null, isAdmin && c.TenantId is not null);

    public CategoryRef CategoryRef(Category c) => new(c.Id, Lang.Pick(c.Name, c.NameEn), c.Slug);

    public ReviewDto Review(Review r, int? currentUserId) => new(
        r.Id, r.BookId, r.Rating, r.Comment, r.CreatedAt, r.UpdatedAt,
        new ReviewAuthorDto(r.User.Id, $"{r.User.FirstName} {(r.User.LastName.Length > 0 ? r.User.LastName[0] + "." : "")}".Trim(), urls.Avatar(r.User)),
        currentUserId == r.UserId);

    public static ProgressDto Progress(ReadingProgress p) => new(
        p.CurrentPage, p.TotalPages, p.TotalPages == 0 ? 0 : (int)Math.Round(100.0 * p.CurrentPage / p.TotalPages),
        p.Status, p.StartedAt, p.LastReadAt, p.FinishedAt);

    public InboxEmailDto Email(EmailMessage e) => new(
        e.Id, e.ToEmail, e.Subject, e.Type, e.Code,
        e.BodyText.Length > 140 ? e.BodyText[..140].ReplaceLineEndings(" ") + "…" : e.BodyText.ReplaceLineEndings(" "),
        e.BodyText, e.BodyHtml, e.CreatedAt);

    public IReadOnlyList<ChapterDto> Chapters(Book b)
    {
        if (string.IsNullOrEmpty(b.ChaptersJson)) return [];
        return JsonSerializer.Deserialize<List<ChapterDto>>(b.ChaptersJson, JsonDefaults.Options) ?? [];
    }

    public bool IsNew(Book b) => clock.UtcNow - b.CreatedAt < TimeSpan.FromDays(45);
}
