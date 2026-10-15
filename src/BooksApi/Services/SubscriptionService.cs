using System.Security.Cryptography;
using BooksApi.Data;
using BooksApi.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace BooksApi.Services;

/// <summary>Everything a client needs to decide what to show: computed from the stored subscription and "now".</summary>
public sealed record SubscriptionState(
    string Status,           // none | trialing | active | canceled | expired
    bool IsTrial,
    bool HasAccess,
    bool CanDownload,
    bool CanStartTrial,
    DateTime? AccessUntil,
    DateTime? RenewsAt,
    int DaysLeft,
    DateTime Now);

/// <summary>
/// The subscription state machine.
///
///   none ──trial──▶ trialing ──(trial ends, card saved)──▶ active ──(period ends)──▶ renew or expired
///     │                │  └──(trial ends, no card)──▶ expired
///     └──checkout──▶ active ◀──resume── canceled ──(period ends)──▶ expired
///
/// Time-based transitions happen lazily: whenever a subscription is loaded, <see cref="RefreshAsync"/>
/// moves it forward to "now" (charging renewals with the saved test card). That is what makes the
/// sandbox time-travel endpoint work.
/// </summary>
public sealed class SubscriptionService(AppDbContext db, IClock clock, FakePaymentGateway gateway, Mailer mailer, IHttpContextAccessor http)
{
    private Lang Lang => http.HttpContext.GetLang();

    public DateTime Now(User user) => clock.Now(user);

    public async Task<Subscription?> LoadAsync(User user)
    {
        var sub = await db.Subscriptions.Include(s => s.Plan).FirstOrDefaultAsync(s => s.UserId == user.Id);
        if (sub is not null) await RefreshAsync(user, sub);
        return sub;
    }

    public SubscriptionState Describe(User user, Subscription? sub)
    {
        var now = Now(user);
        var canStartTrial = !user.HasUsedTrial && (sub is null || sub.Status == SubscriptionStatus.Expired);
        if (sub is null) return new("none", false, false, false, canStartTrial, null, null, 0, now);

        var hasAccess = sub.Status is SubscriptionStatus.Trialing or SubscriptionStatus.Active or SubscriptionStatus.Canceled
                        && now < sub.CurrentPeriodEnd;
        var renews = sub.Status is SubscriptionStatus.Active or SubscriptionStatus.Trialing
                     && !sub.CancelAtPeriodEnd && !sub.IsComplimentary && sub.CardLast4 is not null
            ? sub.CurrentPeriodEnd : (DateTime?)null;
        return new(
            sub.Status.ToString().ToLowerInvariant(),
            sub.IsTrial,
            hasAccess,
            hasAccess && !sub.IsTrial && sub.Plan.AllowDownload,
            canStartTrial,
            hasAccess ? sub.CurrentPeriodEnd : null,
            renews,
            hasAccess ? (int)Math.Ceiling((sub.CurrentPeriodEnd - now).TotalDays) : 0,
            now);
    }

    /// <summary>Applies everything that should have happened between the last visit and now.</summary>
    public async Task RefreshAsync(User user, Subscription sub)
    {
        var now = Now(user);
        var changed = false;
        for (var guard = 0; guard < 120 && now >= sub.CurrentPeriodEnd; guard++)
        {
            if (sub.Status == SubscriptionStatus.Expired) break;
            var at = sub.CurrentPeriodEnd;
            changed = true;

            var renewable = sub.Status is SubscriptionStatus.Active or SubscriptionStatus.Trialing
                            && !sub.CancelAtPeriodEnd && !sub.IsComplimentary && sub.CardBehavior is not null;
            if (!renewable)
            {
                var wasTrial = sub.IsTrial;
                Expire(sub, at);
                await mailer.SendAsync(user.TenantId, user.Email, MailTemplates.Expired(Lang, user.FirstName, wasTrial));
                break;
            }

            var failure = gateway.Charge(SavedCardOf(sub), sub.Plan.PriceMinor, at, offSession: true);
            var payment = NewPayment(user, sub.Plan, failure is null ? PaymentStatus.Succeeded : PaymentStatus.Failed,
                sub.IsTrial ? PaymentKind.Subscription : PaymentKind.Renewal, at, sub);
            payment.FailureCode = failure;
            if (failure is not null)
            {
                db.Payments.Add(payment);
                Expire(sub, at);
                await mailer.SendAsync(user.TenantId, user.Email, MailTemplates.PaymentFailed(Lang, user.FirstName, ErrorCatalog.Get(failure, Lang).Message));
                break;
            }
            sub.Status = SubscriptionStatus.Active;
            sub.IsTrial = false;
            sub.CurrentPeriodStart = at;
            sub.CurrentPeriodEnd = AddInterval(at, sub.Plan.Interval);
            payment.PeriodStart = sub.CurrentPeriodStart;
            payment.PeriodEnd = sub.CurrentPeriodEnd;
            db.Payments.Add(payment);
            await mailer.SendAsync(user.TenantId, user.Email, MailTemplates.Receipt(Lang, user.FirstName, payment, PlanName(sub.Plan)));
        }
        if (changed)
        {
            sub.UpdatedAt = clock.UtcNow;
            await db.SaveChangesAsync();
        }
    }

    public async Task<Subscription> StartTrialAsync(User user, Plan plan)
    {
        if (!user.IsVerified) throw ApiException.Forbidden("EMAIL_NOT_VERIFIED");
        var sub = await LoadAsync(user);
        if (sub is not null && sub.Status != SubscriptionStatus.Expired) throw ApiException.Conflict("ALREADY_SUBSCRIBED");
        if (user.HasUsedTrial) throw ApiException.Conflict("TRIAL_ALREADY_USED");

        var now = Now(user);
        sub ??= NewSubscription(user);
        sub.Plan = plan;
        sub.PlanId = plan.Id;
        sub.Status = SubscriptionStatus.Trialing;
        sub.IsTrial = true;
        sub.IsComplimentary = false;
        sub.StartedAt = now;
        sub.CurrentPeriodStart = now;
        sub.CurrentPeriodEnd = now.AddDays(plan.TrialDays);
        sub.TrialEndsAt = sub.CurrentPeriodEnd;
        sub.CancelAtPeriodEnd = false;
        sub.CanceledAt = null;
        sub.EndedAt = null;
        ClearCard(sub);
        sub.UpdatedAt = clock.UtcNow;
        user.HasUsedTrial = true;
        await db.SaveChangesAsync();
        await mailer.SendAsync(user.TenantId, user.Email, MailTemplates.TrialStarted(Lang, user.FirstName, PlanName(plan), sub.CurrentPeriodEnd));
        return sub;
    }

    /// <summary>Pay now. During a trial the remaining trial days are kept: the paid period starts when the trial ends.</summary>
    public async Task<(Subscription, Payment)> CheckoutAsync(User user, Plan plan, CardInput? cardInput)
    {
        if (!user.IsVerified) throw ApiException.Forbidden("EMAIL_NOT_VERIFIED");
        var sub = await LoadAsync(user);
        if (sub is { Status: SubscriptionStatus.Active or SubscriptionStatus.Canceled }) throw ApiException.Conflict("ALREADY_SUBSCRIBED");

        var now = Now(user);
        var v = new Validator(Lang);
        var card = gateway.Validate(cardInput, now, v);
        v.ThrowIfInvalid();

        var failure = gateway.Charge(card!, plan.PriceMinor, now, offSession: false);
        var payment = NewPayment(user, plan, failure is null ? PaymentStatus.Succeeded : PaymentStatus.Failed, PaymentKind.Subscription, now, null);
        payment.CardBrand = card!.Brand;
        payment.CardLast4 = card.Last4;
        if (failure is not null)
        {
            payment.FailureCode = failure;
            db.Payments.Add(payment);
            await db.SaveChangesAsync();
            throw new ApiException(402, failure) { Extensions = { ["paymentId"] = payment.Id } };
        }

        var startsAfterTrial = sub is { Status: SubscriptionStatus.Trialing } && sub.CurrentPeriodEnd > now ? sub.CurrentPeriodEnd : now;
        var isNew = sub is null;
        sub ??= NewSubscription(user);
        sub.Plan = plan;
        sub.PlanId = plan.Id;
        if (isNew || sub.Status != SubscriptionStatus.Trialing) sub.StartedAt = now;
        sub.Status = SubscriptionStatus.Active;
        sub.IsTrial = false;
        sub.IsComplimentary = false;
        sub.CurrentPeriodStart = now;
        sub.CurrentPeriodEnd = AddInterval(startsAfterTrial, plan.Interval);
        sub.CancelAtPeriodEnd = false;
        sub.CanceledAt = null;
        sub.EndedAt = null;
        SaveCard(sub, card);
        sub.UpdatedAt = clock.UtcNow;
        user.HasUsedTrial = true; // the trial is for first-time subscribers only

        payment.PeriodStart = sub.CurrentPeriodStart;
        payment.PeriodEnd = sub.CurrentPeriodEnd;
        db.Payments.Add(payment);
        await db.SaveChangesAsync();
        await mailer.SendAsync(user.TenantId, user.Email, MailTemplates.Receipt(Lang, user.FirstName, payment, PlanName(plan)));
        return (sub, payment);
    }

    /// <summary>Cancel at period end: access continues until the end of the paid period (or trial).</summary>
    public async Task<Subscription> CancelAsync(User user)
    {
        var sub = await LoadAsync(user);
        if (sub is not { Status: SubscriptionStatus.Active or SubscriptionStatus.Trialing }) throw ApiException.Conflict("NOTHING_TO_CANCEL");
        sub.Status = SubscriptionStatus.Canceled;
        sub.CancelAtPeriodEnd = true;
        sub.CanceledAt = Now(user);
        sub.UpdatedAt = clock.UtcNow;
        await db.SaveChangesAsync();
        await mailer.SendAsync(user.TenantId, user.Email, MailTemplates.Canceled(Lang, user.FirstName, sub.CurrentPeriodEnd));
        return sub;
    }

    public async Task<Subscription> ResumeAsync(User user)
    {
        var sub = await LoadAsync(user);
        if (sub is not { Status: SubscriptionStatus.Canceled } || Now(user) >= sub.CurrentPeriodEnd) throw ApiException.Conflict("CANNOT_RESUME");
        sub.Status = sub.IsTrial ? SubscriptionStatus.Trialing : SubscriptionStatus.Active;
        sub.CancelAtPeriodEnd = false;
        sub.CanceledAt = null;
        sub.UpdatedAt = clock.UtcNow;
        await db.SaveChangesAsync();
        return sub;
    }

    /// <summary>Switch plan right away: the saved card is charged the full new price and a new period starts.</summary>
    public async Task<(Subscription, Payment)> ChangePlanAsync(User user, Plan plan)
    {
        var sub = await LoadAsync(user);
        if (sub is not { Status: SubscriptionStatus.Active, IsTrial: false }) throw ApiException.Conflict("NOT_ACTIVE");
        if (sub.PlanId == plan.Id) throw ApiException.Conflict("SAME_PLAN");
        if (sub.CardBehavior is null) throw ApiException.Conflict("NO_PAYMENT_METHOD");

        var now = Now(user);
        var failure = gateway.Charge(SavedCardOf(sub), plan.PriceMinor, now, offSession: true);
        var payment = NewPayment(user, plan, failure is null ? PaymentStatus.Succeeded : PaymentStatus.Failed, PaymentKind.PlanChange, now, sub);
        if (failure is not null)
        {
            payment.FailureCode = failure;
            db.Payments.Add(payment);
            await db.SaveChangesAsync();
            throw new ApiException(402, failure) { Extensions = { ["paymentId"] = payment.Id } };
        }
        sub.Plan = plan;
        sub.PlanId = plan.Id;
        sub.IsComplimentary = false;
        sub.CurrentPeriodStart = now;
        sub.CurrentPeriodEnd = AddInterval(now, plan.Interval);
        sub.UpdatedAt = clock.UtcNow;
        payment.PeriodStart = sub.CurrentPeriodStart;
        payment.PeriodEnd = sub.CurrentPeriodEnd;
        db.Payments.Add(payment);
        await db.SaveChangesAsync();
        await mailer.SendAsync(user.TenantId, user.Email, MailTemplates.Receipt(Lang, user.FirstName, payment, PlanName(plan)));
        return (sub, payment);
    }

    /// <summary>Save or replace the card. During a trial this means "charge me when the trial ends".</summary>
    public async Task<Subscription> UpdateCardAsync(User user, CardInput? cardInput)
    {
        var sub = await LoadAsync(user);
        if (sub is null || sub.Status == SubscriptionStatus.Expired) throw ApiException.Conflict("NOT_ACTIVE");
        var now = Now(user);
        var v = new Validator(Lang);
        var card = gateway.Validate(cardInput, now, v);
        v.ThrowIfInvalid();
        // a zero-amount authorization, like real processors do when you save a card
        var failure = gateway.Charge(card!, 0, now, offSession: false);
        if (failure is not null) throw new ApiException(402, failure);
        SaveCard(sub, card!);
        sub.UpdatedAt = clock.UtcNow;
        await db.SaveChangesAsync();
        return sub;
    }

    /// <summary>Admin: give a user free access for some days (customer support, giveaways…).</summary>
    public async Task<Subscription> GrantAsync(User user, Plan plan, int days)
    {
        var sub = await LoadAsync(user) ?? NewSubscription(user);
        var now = Now(user);
        sub.Plan = plan;
        sub.PlanId = plan.Id;
        if (sub.Status is SubscriptionStatus.Expired || sub.Id == 0) sub.StartedAt = now;
        sub.Status = SubscriptionStatus.Active;
        sub.IsTrial = false;
        sub.IsComplimentary = true;
        sub.CurrentPeriodStart = now;
        sub.CurrentPeriodEnd = now.AddDays(days);
        sub.CancelAtPeriodEnd = false;
        sub.CanceledAt = null;
        sub.EndedAt = null;
        sub.UpdatedAt = clock.UtcNow;
        var payment = NewPayment(user, plan, PaymentStatus.Succeeded, PaymentKind.Complimentary, now, sub);
        payment.AmountMinor = 0;
        payment.PeriodStart = sub.CurrentPeriodStart;
        payment.PeriodEnd = sub.CurrentPeriodEnd;
        db.Payments.Add(payment);
        await db.SaveChangesAsync();
        return sub;
    }

    /// <summary>Sandbox: forget the subscription, the payments and the used trial, and reset the clock.</summary>
    public async Task ResetAsync(User user)
    {
        await db.Subscriptions.Where(s => s.UserId == user.Id).ExecuteDeleteAsync();
        await db.Payments.Where(p => p.UserId == user.Id).ExecuteDeleteAsync();
        user.HasUsedTrial = false;
        user.ClockOffsetDays = 0;
        await db.SaveChangesAsync();
    }

    public string PlanName(Plan plan) => Lang.Pick(plan.Name, plan.NameEn);

    public static DateTime AddInterval(DateTime from, string interval) =>
        interval == "year" ? from.AddYears(1) : from.AddMonths(1);

    private Subscription NewSubscription(User user)
    {
        var sub = new Subscription { TenantId = user.TenantId, UserId = user.Id, CreatedAt = clock.UtcNow };
        db.Subscriptions.Add(sub);
        return sub;
    }

    private static void Expire(Subscription sub, DateTime at)
    {
        sub.Status = SubscriptionStatus.Expired;
        sub.EndedAt = at;
        sub.IsTrial = false;
        sub.CancelAtPeriodEnd = false;
    }

    private Payment NewPayment(User user, Plan plan, PaymentStatus status, PaymentKind kind, DateTime at, Subscription? sub) => new()
    {
        TenantId = user.TenantId,
        UserId = user.Id,
        PlanId = plan.Id,
        Plan = plan,
        InvoiceNumber = $"ANB-{at:yyyyMMdd}-{Convert.ToHexString(RandomNumberGenerator.GetBytes(4))}",
        AmountMinor = plan.PriceMinor,
        Currency = plan.Currency,
        Status = status,
        Kind = kind,
        CardBrand = sub?.CardBrand,
        CardLast4 = sub?.CardLast4,
        CreatedAt = at,
    };

    private static SavedCard SavedCardOf(Subscription s) =>
        new(s.CardBrand ?? "card", s.CardLast4 ?? "0000", s.CardExpMonth ?? 12, s.CardExpYear ?? 2099, s.CardHolder ?? "", s.CardBehavior ?? "declined");

    private static void SaveCard(Subscription sub, SavedCard card)
    {
        sub.CardBrand = card.Brand;
        sub.CardLast4 = card.Last4;
        sub.CardExpMonth = card.ExpMonth;
        sub.CardExpYear = card.ExpYear;
        sub.CardHolder = card.Holder;
        sub.CardBehavior = card.Behavior;
    }

    private static void ClearCard(Subscription sub)
    {
        sub.CardBrand = null;
        sub.CardLast4 = null;
        sub.CardExpMonth = null;
        sub.CardExpYear = null;
        sub.CardHolder = null;
        sub.CardBehavior = null;
    }
}
