using BooksApi.Contracts;
using BooksApi.Infrastructure;
using BooksApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BooksApi.Controllers;

/// <summary>
/// Learning tools that a real production API would NOT have: read the e-mails the API sent,
/// move a user's clock forward to watch a trial expire, reset a subscription, list test cards.
/// </summary>
[Route("api/sandbox")]
[Tags("Sandbox")]
public sealed class SandboxController(SubscriptionService subscriptions, DtoMapper map, IOptions<SandboxOptions> options, IClock clock) : ApiControllerBase
{
    /// <summary>
    /// შემოსული წერილები (დადასტურების და აღდგენის კოდები, ქვითრები...). email პარამეტრი, ან ავტორიზებული მომხმარებლის ელ-ფოსტა.
    /// </summary>
    [HttpGet("inbox")]
    public async Task<PagedResult<InboxEmailDto>> Inbox(string? email, int? page, int? pageSize)
    {
        if (!options.Value.EnableInbox) throw ApiException.NotFound("NOT_FOUND");
        var v = NewValidator().Email("email", email);
        var (p, size) = Paging.Read(v, page, pageSize, defaultSize: 20, max: 50);
        var address = email ?? (await OptionalUserAsync())?.Email;
        if (address is null) v.Add("email", "მიუთითეთ email პარამეტრი ან გამოგზავნეთ ტოკენი.", "Pass the email parameter or send a token.");
        v.ThrowIfInvalid();

        var normalized = address!.Trim().ToLowerInvariant();
        var query = Db.Emails.Where(e => e.ToEmail == normalized).OrderByDescending(e => e.Id);
        var total = await query.CountAsync();
        var items = await query.Skip((p - 1) * size).Take(size).ToListAsync();
        return PagedResult<InboxEmailDto>.Create(items.Select(map.Email).ToList(), p, size, total);
    }

    /// <summary>ინბოქსის გასუფთავება მოცემული ელ-ფოსტისთვის.</summary>
    [HttpDelete("inbox")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> ClearInbox(string? email)
    {
        NewValidator().Required("email", email).Email("email", email).ThrowIfInvalid();
        var normalized = email!.Trim().ToLowerInvariant();
        await Db.Emails.Where(e => e.ToEmail == normalized).ExecuteDeleteAsync();
        return NoContent();
    }

    /// <summary>სატესტო ბარათები გადახდის სცენარების შესამოწმებლად.</summary>
    [HttpGet("test-cards")]
    public List<TestCardDto> TestCards() =>
        FakePaymentGateway.TestCards.Select(c => new TestCardDto(
            string.Join(' ', c.Number.Chunk(4).Select(x => new string(x))), c.Brand, c.Behavior, Lang.Pick(c.DescriptionKa, c.DescriptionEn))).ToList();

    /// <summary>მომხმარებლის საათი: რეალური დრო და „დროში მოგზაურობის“ შემდეგ არსებული დრო.</summary>
    [HttpGet("clock")]
    [Authorize]
    public async Task<ClockDto> Clock()
    {
        var user = await CurrentUserAsync();
        return new ClockDto(clock.UtcNow, clock.Now(user), user.ClockOffsetDays);
    }

    /// <summary>
    /// „დროში მოგზაურობა“: მომხმარებლის საათს days დღით წინ წევს (1–400), მაგ. 8 დღე — საცდელი პერიოდი იწურება,
    /// 31 დღე — თვიური გამოწერა ავტომატურად ახლდება. მოქმედებს მხოლოდ ამ მომხმარებელზე.
    /// </summary>
    [HttpPost("time-travel")]
    [Authorize]
    public async Task<ClockDto> TimeTravel(TimeTravelRequest req)
    {
        NewValidator().Required("days", req.Days).Range("days", req.Days, 1, 400).ThrowIfInvalid();
        var user = await CurrentUserAsync();
        user.ClockOffsetDays = Math.Min(user.ClockOffsetDays + req.Days!.Value, 2000);
        await Db.SaveChangesAsync();
        await subscriptions.LoadAsync(user); // apply renewals / expiry right away
        return new ClockDto(clock.UtcNow, clock.Now(user), user.ClockOffsetDays);
    }

    /// <summary>გამოწერის სრული გადატვირთვა: გამოწერა, გადახდები და გამოყენებული საცდელი პერიოდი იშლება, საათი ბრუნდება.</summary>
    [HttpPost("reset-subscription")]
    [Authorize]
    public async Task<SubscriptionDto> ResetSubscription()
    {
        var user = await CurrentUserAsync();
        await subscriptions.ResetAsync(user);
        return map.Subscription(user, null, subscriptions.Describe(user, null));
    }
}
