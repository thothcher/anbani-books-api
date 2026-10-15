using BooksApi.Contracts;
using BooksApi.Data;
using BooksApi.Infrastructure;
using BooksApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BooksApi.Controllers;

/// <summary>Subscription plans (public).</summary>
[Route("api/plans")]
[Tags("Plans")]
public sealed class PlansController(DtoMapper map) : ApiControllerBase
{
    /// <summary>გამოწერის გეგმები: ფასი, პერიოდი, საცდელი დღეები, რა შედის.</summary>
    [HttpGet]
    public async Task<List<PlanDto>> List() =>
        (await Db.Plans.OrderBy(p => p.SortOrder).ToListAsync()).Select(map.Plan).ToList();

    /// <summary>ერთი გეგმა (id ან code: "monthly", "annual").</summary>
    [HttpGet("{idOrCode}")]
    public async Task<PlanDto> Get(string idOrCode)
    {
        var plan = int.TryParse(idOrCode, out var id)
            ? await Db.Plans.FirstOrDefaultAsync(p => p.Id == id)
            : await Db.Plans.FirstOrDefaultAsync(p => p.Code == idOrCode.ToLower());
        return map.Plan(plan ?? throw ApiException.NotFound("PLAN_NOT_FOUND"));
    }
}

/// <summary>The signed-in user's subscription: free trial, checkout with a test card, cancel, resume, change plan.</summary>
[Route("api/subscription")]
[Tags("Subscription")]
[Authorize]
public sealed class SubscriptionController(SubscriptionService subscriptions, DtoMapper map) : ApiControllerBase
{
    /// <summary>მიმდინარე გამოწერა. თუ გამოწერა არ გაქვთ, status = "none".</summary>
    [HttpGet]
    public async Task<SubscriptionDto> Get()
    {
        var user = await CurrentUserAsync();
        return await DtoAsync(user, await subscriptions.LoadAsync(user));
    }

    /// <summary>7-დღიანი უფასო საცდელი პერიოდის დაწყება (ბარათის გარეშე). საჭიროა დადასტურებული ელ-ფოსტა; ერთხელ ანგარიშზე.</summary>
    [HttpPost("trial")]
    public async Task<SubscriptionDto> StartTrial(TrialRequest req)
    {
        var user = await CurrentUserAsync();
        var plan = await PlanAsync(req.PlanId);
        return await DtoAsync(user, await subscriptions.StartTrialAsync(user, plan));
    }

    /// <summary>გადახდა სატესტო ბარათით და გამოწერის გააქტიურება. 402 — ბარათი უარყოფილია.</summary>
    [HttpPost("checkout")]
    public async Task<CheckoutResponse> Checkout(CheckoutRequest req)
    {
        var user = await CurrentUserAsync();
        var plan = await PlanAsync(req.PlanId);
        var (sub, payment) = await subscriptions.CheckoutAsync(user, plan, ToInput(req.Card));
        return new CheckoutResponse(await DtoAsync(user, sub), map.Payment(payment));
    }

    /// <summary>გაუქმება: წვდომა რჩება მიმდინარე პერიოდის ბოლომდე, შემდეგ აღარ განახლდება.</summary>
    [HttpPost("cancel")]
    public async Task<SubscriptionDto> Cancel()
    {
        var user = await CurrentUserAsync();
        return await DtoAsync(user, await subscriptions.CancelAsync(user));
    }

    /// <summary>გაუქმებული (მაგრამ ჯერ მოქმედი) გამოწერის აღდგენა.</summary>
    [HttpPost("resume")]
    public async Task<SubscriptionDto> Resume()
    {
        var user = await CurrentUserAsync();
        return await DtoAsync(user, await subscriptions.ResumeAsync(user));
    }

    /// <summary>გეგმის შეცვლა (მაგ. თვიურიდან წლიურზე): შენახული ბარათიდან ახალი გეგმის სრული ფასი ჩამოიჭრება.</summary>
    [HttpPut("plan")]
    public async Task<CheckoutResponse> ChangePlan(ChangePlanRequest req)
    {
        var user = await CurrentUserAsync();
        var plan = await PlanAsync(req.PlanId);
        var (sub, payment) = await subscriptions.ChangePlanAsync(user, plan);
        return new CheckoutResponse(await DtoAsync(user, sub), map.Payment(payment));
    }

    /// <summary>ბარათის შენახვა/შეცვლა. საცდელ პერიოდში ნიშნავს: „საცდელის ბოლოს ჩამომაჭერით და გააგრძელეთ“.</summary>
    [HttpPut("payment-method")]
    public async Task<SubscriptionDto> UpdatePaymentMethod(PaymentMethodRequest req)
    {
        var user = await CurrentUserAsync();
        return await DtoAsync(user, await subscriptions.UpdateCardAsync(user, ToInput(req.Card)));
    }

    private async Task<SubscriptionDto> DtoAsync(User user, Subscription? sub)
    {
        if (sub is not null && sub.Plan is null) await Db.Entry(sub).Reference(s => s.Plan).LoadAsync();
        return map.Subscription(user, sub, subscriptions.Describe(user, sub));
    }

    private async Task<Plan> PlanAsync(int? planId)
    {
        NewValidator().Required("planId", planId).ThrowIfInvalid();
        return await Db.Plans.FirstOrDefaultAsync(p => p.Id == planId) ?? throw ApiException.NotFound("PLAN_NOT_FOUND");
    }

    private static CardInput? ToInput(CardRequest? c) => c is null ? null : new CardInput(c.Number, c.HolderName, c.ExpMonth, c.ExpYear, c.Cvc);
}

/// <summary>Payment history of the signed-in user.</summary>
[Route("api/payments")]
[Tags("Payments")]
[Authorize]
public sealed class PaymentsController(SubscriptionService subscriptions, DtoMapper map) : ApiControllerBase
{
    /// <summary>გადახდების ისტორია (წარმატებული და წარუმატებელი), ახლიდან ძველისკენ.</summary>
    [HttpGet]
    public async Task<PagedResult<PaymentDto>> List(int? page, int? pageSize)
    {
        var v = NewValidator();
        var (p, size) = Paging.Read(v, page, pageSize, defaultSize: 10, max: 50);
        v.ThrowIfInvalid();
        var user = await CurrentUserAsync();
        await subscriptions.LoadAsync(user); // brings renewals up to date
        var query = Db.Payments.Include(x => x.Plan).Where(x => x.UserId == user.Id).OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id);
        var total = await query.CountAsync();
        var items = await query.Skip((p - 1) * size).Take(size).ToListAsync();
        return PagedResult<PaymentDto>.Create(items.Select(map.Payment).ToList(), p, size, total);
    }

    /// <summary>ერთი გადახდა (ქვითარი).</summary>
    [HttpGet("{id:int}")]
    public async Task<PaymentDto> Get(int id)
    {
        var user = await CurrentUserAsync();
        var payment = await Db.Payments.Include(x => x.Plan).FirstOrDefaultAsync(x => x.Id == id && x.UserId == user.Id)
                      ?? throw ApiException.NotFound("PAYMENT_NOT_FOUND");
        return map.Payment(payment);
    }
}
