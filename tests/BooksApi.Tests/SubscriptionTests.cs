using System.Text.Json;

namespace BooksApi.Tests;

public class SubscriptionTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const int Monthly = 1;
    private const int Annual = 2;

    private static async Task<int> BookIdAsync(Sandbox s, string q = "dracula") =>
        (await s.GetAsync($"/api/books?q={q}")).GetProperty("items")[0].Int("id");

    [Fact]
    public async Task Trial_needs_a_verified_email_and_is_given_once()
    {
        var s = await Sandbox.CreateAsync(factory);
        await s.RegisterAsync("trial@example.com", verify: false);
        Assert.Equal("EMAIL_NOT_VERIFIED", (await s.PostAsync("/api/subscription/trial", new { planId = Monthly }, 403)).Code());

        await s.PostAsync("/api/auth/verify-email", new { email = "trial@example.com", code = await s.LastCodeAsync("trial@example.com") });
        var none = await s.GetAsync("/api/subscription");
        Assert.Equal("none", none.Str("status"));
        Assert.True(none.Bool("canStartTrial"));

        var trial = await s.PostAsync("/api/subscription/trial", new { planId = Monthly });
        Assert.Equal("trialing", trial.Str("status"));
        Assert.Equal(7, trial.Int("daysLeft"));
        Assert.True(trial.Bool("hasAccess"));

        Assert.Equal("ALREADY_SUBSCRIBED", (await s.PostAsync("/api/subscription/trial", new { planId = Monthly }, 409)).Code());
    }

    [Fact]
    public async Task Reading_is_behind_the_paywall_and_preview_is_not()
    {
        var s = await Sandbox.CreateAsync(factory);
        await s.RegisterAsync("paywall@example.com");
        var id = await BookIdAsync(s);

        Assert.Equal("SUBSCRIPTION_REQUIRED", (await s.GetAsync($"/api/books/{id}/read", expect: 402)).Code());

        var free = (await s.GetAsync("/api/books?isFree=true")).GetProperty("items")[0].Int("id");
        await s.GetAsync($"/api/books/{free}/read"); // free books only need an account

        await s.PostAsync("/api/subscription/trial", new { planId = Annual });
        var link = await s.GetAsync($"/api/books/{id}/read");
        var pdf = await s.Http.GetAsync(link.Str("url")); // signed link: no headers needed
        var head = new byte[5];
        await (await pdf.Content.ReadAsStreamAsync()).ReadExactlyAsync(head);
        Assert.Equal("%PDF-", System.Text.Encoding.ASCII.GetString(head));

        // downloads: annual plan only, and never during the trial
        Assert.Equal("DOWNLOAD_NOT_INCLUDED", (await s.GetAsync($"/api/books/{id}/download", expect: 403)).Code());
    }

    [Fact]
    public async Task Tampered_file_links_are_refused()
    {
        var s = await Sandbox.CreateAsync(factory);
        await s.RegisterAsync("links@example.com");
        await s.PostAsync("/api/subscription/trial", new { planId = Monthly });
        var link = (await s.GetAsync($"/api/books/{await BookIdAsync(s)}/read")).Str("url");
        var res = await s.Http.GetAsync(link[..^3] + "abc");
        Assert.Equal(403, (int)res.StatusCode);
    }

    [Fact]
    public async Task Checkout_validates_the_card_in_three_layers()
    {
        var s = await Sandbox.CreateAsync(factory);
        await s.RegisterAsync("cards@example.com");

        // 1) format → 400 with nested field names
        var invalid = await s.PostAsync("/api/subscription/checkout", new { planId = Annual, card = new { number = "1234", holderName = "", expMonth = 13, expYear = 2020, cvc = "1" } }, 400);
        var errors = invalid.GetProperty("errors");
        foreach (var f in new[] { "card.number", "card.holderName", "card.expMonth", "card.cvc" }) Assert.True(errors.TryGetProperty(f, out _), f);

        // 2) a real (non-test) card number is never accepted
        Assert.Equal("TEST_CARD_REQUIRED", (await s.PostAsync("/api/subscription/checkout", new { planId = Annual, card = Sandbox.Card("4111111111111111") }, 402)).Code());

        // 3) the "bank" declines — and the failed attempt is kept in the history
        var declined = await s.PostAsync("/api/subscription/checkout", new { planId = Annual, card = Sandbox.Card("4000000000000002") }, 402);
        Assert.Equal("CARD_DECLINED", declined.Code());
        var payments = await s.GetAsync("/api/payments");
        Assert.Equal("failed", payments.GetProperty("items")[0].Str("status"));

        var ok = await s.PostAsync("/api/subscription/checkout", new { planId = Annual, card = Sandbox.Card("4242 4242 4242 4242") });
        Assert.Equal("active", ok.GetProperty("subscription").Str("status"));
        Assert.Equal("succeeded", ok.GetProperty("payment").Str("status"));
        Assert.Equal(129m, ok.GetProperty("payment").GetProperty("amount").GetDecimal());
        Assert.Equal("4242", ok.GetProperty("subscription").GetProperty("paymentMethod").Str("last4"));

        Assert.Equal("ALREADY_SUBSCRIBED", (await s.PostAsync("/api/subscription/checkout", new { planId = Annual, card = Sandbox.Card("4242424242424242") }, 409)).Code());
        await s.GetAsync($"/api/books/{await BookIdAsync(s)}/download"); // annual + paid → downloads allowed
    }

    [Fact]
    public async Task Paying_during_the_trial_keeps_the_remaining_trial_days()
    {
        var s = await Sandbox.CreateAsync(factory);
        await s.RegisterAsync("keep@example.com");
        var trial = await s.PostAsync("/api/subscription/trial", new { planId = Monthly });
        var trialEnd = trial.GetProperty("currentPeriodEnd").GetDateTime();

        var paid = await s.PostAsync("/api/subscription/checkout", new { planId = Annual, card = Sandbox.Card("4242424242424242") });
        var periodEnd = paid.GetProperty("subscription").GetProperty("currentPeriodEnd").GetDateTime();
        Assert.Equal(trialEnd.AddYears(1), periodEnd);
    }

    [Fact]
    public async Task Cancel_keeps_access_until_period_end_and_resume_undoes_it()
    {
        var s = await Sandbox.CreateAsync(factory);
        await s.RegisterAsync("cancel@example.com");
        await s.PostAsync("/api/subscription/checkout", new { planId = Monthly, card = Sandbox.Card("4242424242424242") });

        var canceled = await s.PostAsync("/api/subscription/cancel");
        Assert.Equal("canceled", canceled.Str("status"));
        Assert.True(canceled.Bool("hasAccess"));
        Assert.Equal(JsonValueKind.Null, canceled.GetProperty("renewsAt").ValueKind);

        var resumed = await s.PostAsync("/api/subscription/resume");
        Assert.Equal("active", resumed.Str("status"));
        Assert.NotEqual(JsonValueKind.Null, resumed.GetProperty("renewsAt").ValueKind);

        await s.PostAsync("/api/subscription/cancel");
        await s.PostAsync("/api/sandbox/time-travel", new { days = 32 });
        var after = await s.GetAsync("/api/subscription");
        Assert.Equal("expired", after.Str("status"));
        Assert.Equal("CANNOT_RESUME", (await s.PostAsync("/api/subscription/resume", expect: 409)).Code());
    }

    [Fact]
    public async Task Time_travel_expires_a_trial_without_a_card()
    {
        var s = await Sandbox.CreateAsync(factory);
        await s.RegisterAsync("expire@example.com");
        await s.PostAsync("/api/subscription/trial", new { planId = Monthly });
        await s.PostAsync("/api/sandbox/time-travel", new { days = 8 });

        var sub = await s.GetAsync("/api/subscription");
        Assert.Equal("expired", sub.Str("status"));
        Assert.False(sub.Bool("canStartTrial"));
        await s.GetAsync($"/api/books/{await BookIdAsync(s)}/read", expect: 402);

        var inbox = await s.GetAsync("/api/sandbox/inbox?email=expire@example.com");
        Assert.Contains(inbox.GetProperty("items").EnumerateArray(), m => m.Str("type") == "subscription_expired");
    }

    [Fact]
    public async Task A_trial_with_a_saved_card_converts_when_it_ends()
    {
        var s = await Sandbox.CreateAsync(factory);
        await s.RegisterAsync("convert@example.com");
        await s.PostAsync("/api/subscription/trial", new { planId = Monthly });
        await s.PutAsync("/api/subscription/payment-method", new { card = Sandbox.Card("5555555555554444") });
        await s.PostAsync("/api/sandbox/time-travel", new { days = 8 });

        var sub = await s.GetAsync("/api/subscription");
        Assert.Equal("active", sub.Str("status"));
        Assert.False(sub.Bool("isTrial"));
        Assert.Equal(1, (await s.GetAsync("/api/payments")).Int("totalItems"));
    }

    [Fact]
    public async Task Monthly_renews_and_a_failing_card_ends_the_subscription()
    {
        var renew = await Sandbox.CreateAsync(factory);
        await renew.RegisterAsync("renew@example.com");
        await renew.PostAsync("/api/subscription/checkout", new { planId = Monthly, card = Sandbox.Card("4242424242424242") });
        await renew.PostAsync("/api/sandbox/time-travel", new { days = 65 });
        Assert.Equal("active", (await renew.GetAsync("/api/subscription")).Str("status"));
        var kinds = (await renew.GetAsync("/api/payments")).GetProperty("items").EnumerateArray().Select(p => p.Str("kind")).ToList();
        Assert.Equal(2, kinds.Count(k => k == "renewal"));

        var fail = await Sandbox.CreateAsync(factory);
        await fail.RegisterAsync("fail@example.com");
        await fail.PostAsync("/api/subscription/checkout", new { planId = Monthly, card = Sandbox.Card("4000000000000341") });
        await fail.PostAsync("/api/sandbox/time-travel", new { days = 31 });
        Assert.Equal("expired", (await fail.GetAsync("/api/subscription")).Str("status"));
        var last = (await fail.GetAsync("/api/payments")).GetProperty("items")[0];
        Assert.Equal("failed", last.Str("status"));
        Assert.Equal("CARD_DECLINED", last.Str("failureCode"));
    }

    [Fact]
    public async Task Changing_plan_charges_the_saved_card()
    {
        var s = await Sandbox.CreateAsync(factory);
        await s.RegisterAsync("change@example.com");
        await s.PostAsync("/api/subscription/checkout", new { planId = Monthly, card = Sandbox.Card("4242424242424242") });
        Assert.Equal("SAME_PLAN", (await s.PutAsync("/api/subscription/plan", new { planId = Monthly }, 409)).Code());
        var changed = await s.PutAsync("/api/subscription/plan", new { planId = Annual });
        Assert.Equal("annual", changed.GetProperty("subscription").GetProperty("plan").Str("code"));
        Assert.Equal("planChange", changed.GetProperty("payment").Str("kind"));
    }

    [Fact]
    public async Task Reset_brings_the_trial_back()
    {
        var s = await Sandbox.CreateAsync(factory);
        await s.RegisterAsync("again@example.com");
        await s.PostAsync("/api/subscription/trial", new { planId = Monthly });
        var reset = await s.PostAsync("/api/sandbox/reset-subscription");
        Assert.Equal("none", reset.Str("status"));
        Assert.True(reset.Bool("canStartTrial"));
    }
}
