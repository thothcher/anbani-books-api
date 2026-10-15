using System.Text.Json;
using BooksApi.Contracts;
using BooksApi.Infrastructure;
using BooksApi.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BooksApi.Data;

/// <summary>
/// Startup data:
///   • plans and the built-in library (SeedData/catalog.json → categories + 30 public-domain books)
///   • the demo sandbox used by the reference website: demo accounts plus ~40 made-up readers with
///     subscriptions, payments, reviews and reading history, so the admin dashboard has something to show.
/// Safe to run on every start: existing rows are updated, nothing is duplicated.
/// </summary>
public sealed class Seeder(
    AppDbContext db,
    TenantContext tenant,
    IWebHostEnvironment env,
    IOptions<SandboxOptions> sandbox,
    IPasswordHasher<User> hasher,
    ILogger<Seeder> logger)
{
    public const string DemoPassword = "Anbani2026!";

    public async Task SeedAsync()
    {
        await SeedPlansAsync();
        await SeedCatalogAsync();
        if (sandbox.Value.SeedDemoData && !string.IsNullOrWhiteSpace(sandbox.Value.DemoApiKey))
        {
            var key = await db.ApiKeys.FirstOrDefaultAsync(k => k.Key == sandbox.Value.DemoApiKey);
            if (key is null)
            {
                key = new ApiKey { Key = sandbox.Value.DemoApiKey, Name = "Anbani — reference website", IsDemo = true, CreatedAt = DateTime.UtcNow };
                db.ApiKeys.Add(key);
                await db.SaveChangesAsync();
            }
            tenant.Use(key.Id);
            if (!await db.Users.AnyAsync()) await SeedDemoTenantAsync(key);
        }
    }

    // ── plans ──────────────────────────────────────────────────────────────

    private async Task SeedPlansAsync()
    {
        Plan[] plans =
        [
            new()
            {
                Code = "monthly", Name = "თვიური", NameEn = "Monthly", SortOrder = 1,
                Description = "მთელი ბიბლიოთეკა ნებისმიერ მოწყობილობაზე. გააუქმე როცა გინდა.",
                DescriptionEn = "The whole library on any device. Cancel anytime.",
                PriceMinor = 1299, Currency = "GEL", Interval = "month", TrialDays = 7, AllowDownload = false, IsPopular = false,
                Features = "ბიბლიოთეკის ყველა წიგნი\nკითხვა ბრაუზერში, ნებისმიერ მოწყობილობაზე\nპროგრესი და რჩეულები ყველგან სინქრონდება\n7 დღე უფასოდ, ბარათის გარეშე",
                FeaturesEn = "Every book in the library\nRead in the browser on any device\nProgress and favorites synced everywhere\n7 days free, no card needed",
            },
            new()
            {
                Code = "annual", Name = "წლიური", NameEn = "Annual", SortOrder = 2,
                Description = "ორი თვე საჩუქრად და წიგნების ჩამოტვირთვა ოფლაინ კითხვისთვის.",
                DescriptionEn = "Two months free, plus downloads for offline reading.",
                PriceMinor = 12900, Currency = "GEL", Interval = "year", TrialDays = 7, AllowDownload = true, IsPopular = true,
                Features = "ყველაფერი, რაც თვიურ გეგმაშია\nPDF-ების ჩამოტვირთვა\n2 თვე საჩუქრად (₾155.88-ის ნაცვლად ₾129)\n7 დღე უფასოდ, ბარათის გარეშე",
                FeaturesEn = "Everything in Monthly\nDownload books as PDF\n2 months free (₾129 instead of ₾155.88)\n7 days free, no card needed",
            },
        ];
        foreach (var p in plans)
        {
            var existing = await db.Plans.FirstOrDefaultAsync(x => x.Code == p.Code);
            if (existing is null) db.Plans.Add(p);
            else
            {
                existing.Name = p.Name; existing.NameEn = p.NameEn; existing.Description = p.Description; existing.DescriptionEn = p.DescriptionEn;
                existing.PriceMinor = p.PriceMinor; existing.Interval = p.Interval; existing.TrialDays = p.TrialDays; existing.AllowDownload = p.AllowDownload;
                existing.IsPopular = p.IsPopular; existing.SortOrder = p.SortOrder; existing.Features = p.Features; existing.FeaturesEn = p.FeaturesEn;
            }
        }
        await db.SaveChangesAsync();
    }

    // ── the built-in library ───────────────────────────────────────────────

    private sealed record CatalogFile(List<CatalogCategory> Categories, List<CatalogBook> Books);
    private sealed record CatalogCategory(string Slug, string Ka, string En);
    private sealed record CatalogText(string Ka, string En);
    private sealed record CatalogSource(string Name, string? Url);
    private sealed record CatalogBook(
        string Slug, string Title, string Author, string? Translator, int Year, CatalogText YearLabel, string Language, string Category,
        bool IsFree, string[] Tags, CatalogText Description, double Rating, int RatingCount, int Readers, int Pages, int PreviewPages,
        int Words, int ReadingMinutes, List<ChapterDto> Chapters, string File, string PreviewFile, long FileSize, long PreviewFileSize, CatalogSource Source);

    private async Task SeedCatalogAsync()
    {
        var path = Path.Combine(env.ContentRootPath, "SeedData", "catalog.json");
        if (!File.Exists(path))
        {
            logger.LogWarning("SeedData/catalog.json not found — the built-in library is empty");
            return;
        }
        var catalog = JsonSerializer.Deserialize<CatalogFile>(await File.ReadAllTextAsync(path), JsonDefaults.Options)!;
        var now = DateTime.UtcNow;

        var categories = await db.Categories.IgnoreQueryFilters().Where(c => c.TenantId == null).ToListAsync();
        for (var i = 0; i < catalog.Categories.Count; i++)
        {
            var c = catalog.Categories[i];
            var row = categories.FirstOrDefault(x => x.Slug == c.Slug);
            if (row is null)
            {
                row = new Category { Slug = c.Slug, CreatedAt = now };
                db.Categories.Add(row);
                categories.Add(row);
            }
            row.Name = c.Ka;
            row.NameEn = c.En;
            row.SortOrder = i + 1;
            row.UpdatedAt = now;
        }
        await db.SaveChangesAsync();

        var books = await db.Books.IgnoreQueryFilters().Where(b => b.TenantId == null).ToListAsync();
        // a few titles count as "new arrivals" when the database is first created
        string[] newArrivals = ["jakos-khiznebi", "gandegili", "frankenstein", "meditations", "hound-of-the-baskervilles"];
        var chaptersOptions = new JsonSerializerOptions(JsonDefaults.Options);
        for (var i = 0; i < catalog.Books.Count; i++)
        {
            var b = catalog.Books[i];
            var row = books.FirstOrDefault(x => x.Slug == b.Slug);
            if (row is null)
            {
                var arrival = Array.IndexOf(newArrivals, b.Slug);
                row = new Book
                {
                    Slug = b.Slug,
                    CoverKey = $"s-{b.Slug}",
                    PreviewKey = $"s-{b.Slug}",
                    CreatedAt = arrival >= 0 ? now.AddDays(-3 - arrival * 6) : now.AddDays(-60 - i * 3),
                    PublishedAt = now,
                };
                db.Books.Add(row);
            }
            row.Title = b.Title;
            row.Author = b.Author;
            row.Translator = b.Translator;
            row.Description = b.Description.Ka;
            row.DescriptionEn = b.Description.En;
            row.CategoryId = categories.First(c => c.Slug == b.Category).Id;
            row.Language = b.Language;
            row.Year = b.Year;
            row.YearLabel = b.YearLabel.Ka;
            row.YearLabelEn = b.YearLabel.En;
            row.Pages = b.Pages;
            row.PreviewPages = b.PreviewPages;
            row.Words = b.Words;
            row.ReadingMinutes = b.ReadingMinutes;
            row.IsFree = b.IsFree;
            row.IsPublished = true;
            row.Tags = string.Join(',', b.Tags);
            row.ChaptersJson = JsonSerializer.Serialize(b.Chapters, chaptersOptions);
            row.PdfFile = $"seed:books/{b.File}";
            row.PdfSize = b.FileSize;
            row.PreviewFile = $"seed:books/{b.PreviewFile}";
            row.PreviewSize = b.PreviewFileSize;
            row.SeedRating = b.Rating;
            row.SeedRatingCount = b.RatingCount;
            row.SeedReaders = b.Readers;
            row.SourceName = b.Source.Name;
            row.SourceUrl = b.Source.Url;
            row.UpdatedAt = row.UpdatedAt == default ? now : row.UpdatedAt;
        }
        // built-in books that were removed from the catalog disappear
        var slugs = catalog.Books.Select(b => b.Slug).ToHashSet();
        db.Books.RemoveRange(books.Where(b => b.Slug is not null && !slugs.Contains(b.Slug)));
        await db.SaveChangesAsync();
        logger.LogInformation("Library ready: {Books} books in {Categories} categories", catalog.Books.Count, catalog.Categories.Count);
    }

    // ── the demo sandbox ───────────────────────────────────────────────────

    private static readonly string[] FirstNames = ["ნინო", "გიორგი", "მარიამ", "ლუკა", "ანა", "საბა", "ელენე", "დავით", "თამარ", "ლევან", "სალომე", "ნიკა", "ქეთევან", "ირაკლი", "მარიამი", "ბექა", "ნათია", "ზურა", "ეკა", "თორნიკე", "ლიკა", "დათო", "სოფო", "გურამ"];
    private static readonly string[] LastNames = ["ბერიძე", "კაპანაძე", "გელაშვილი", "მაისურაძე", "ლომიძე", "წიკლაური", "ჯაფარიძე", "ხარაიშვილი", "ქავთარაძე", "მჭედლიშვილი", "ნოზაძე", "ბოლქვაძე", "ცინცაძე", "გოგიჩაიშვილი", "აბაშიძე"];
    private static readonly string[] Latin = ["nino", "giorgi", "mariam", "luka", "ana", "saba", "elene", "davit", "tamar", "levan", "salome", "nika", "keti", "irakli", "mari", "beka", "natia", "zura", "eka", "tornike", "lika", "dato", "sopo", "guram"];

    private static readonly string[] CommentsKa =
    [
        "ერთ ღამეში წავიკითხე. ძალიან მომეწონა!",
        "სკოლაში ძალით გვაკითხებდნენ, ახლა კი სიამოვნებით გადავიკითხე.",
        "ენა ცოტა რთულია, მაგრამ ნამდვილად ღირს.",
        "ერთ-ერთი საუკეთესო წიგნი, რაც ბოლო დროს წამიკითხავს.",
        "პერსონაჟები ისეთი ცოცხლები არიან, თითქოს დიდი ხანია იცნობ.",
        "ტელეფონიდანაც მშვენივრად იკითხება, გვერდიც ახსოვს სად გავჩერდი.",
        "ფინალმა ცრემლი მომგვარა.",
        "შუა ნაწილი ცოტა გაწელილია, მაგრამ დასასრული ყველაფერს ამართლებს.",
        "დიდი ხანია მინდოდა წამეკითხა და ბოლოს და ბოლოს მოვახერხე.",
        "კლასიკაა — სხვა რა უნდა ითქვას.",
        "მეორედ ვკითხულობ და ახალ დეტალებს ვამჩნევ.",
        "საოცარი ატმოსფეროა, თითქოს თავად იქ ხარ.",
        "დღესაც ძალიან აქტუალურია.",
        "შვილს ვუკითხე ძილის წინ, ორივეს ძალიან მოგვეწონა.",
    ];
    private static readonly string[] CommentsEn =
    [
        "Couldn't put it down. Read it in two evenings.",
        "A classic for a reason — still feels modern.",
        "Slow start, but the ending is worth it.",
        "Great for reading on the bus, the reader remembers my page.",
        "My favourite book of the year.",
        "Re-read it after school — a completely different experience.",
        "Darker than I expected, in a good way.",
        "The characters stayed with me for days.",
        "Short, sharp and surprisingly funny.",
        "Not my favourite, but I'm glad I read it.",
    ];

    public async Task SeedDemoTenantAsync(ApiKey key)
    {
        tenant.Use(key.Id);
        var rng = new Random(2026);
        var now = DateTime.UtcNow;
        var plans = await db.Plans.ToListAsync();
        var monthly = plans.First(p => p.Code == "monthly");
        var annual = plans.First(p => p.Code == "annual");
        var books = await db.Books.Where(b => b.IsPublished).ToListAsync();

        User NewUser(string first, string last, string email, UserRole role, bool demo, DateTime created)
        {
            var u = new User
            {
                TenantId = key.Id, FirstName = first, LastName = last, Email = email, NormalizedEmail = email.ToLowerInvariant(),
                Role = role, IsVerified = true, VerifiedAt = created.AddMinutes(4), IsDemoAccount = demo,
                CreatedAt = created, UpdatedAt = created, LastLoginAt = now.AddHours(-rng.Next(1, 200)),
            };
            u.PasswordHash = hasher.HashPassword(u, demo ? DemoPassword : Guid.NewGuid().ToString("N"));
            db.Users.Add(u);
            return u;
        }

        // the accounts the teacher and students use to explore the reference website
        var admin = NewUser("ანბანი", "ადმინი", "admin@anbani.ge", UserRole.Admin, true, now.AddDays(-90));
        admin.Bio = "სადემონსტრაციო ადმინისტრატორი — მართავს წიგნებს, კატეგორიებს და მომხმარებლებს.";
        var reader = NewUser("ნინო", "ბერიძე", "reader@anbani.ge", UserRole.User, true, now.AddDays(-40));
        reader.Bio = "ვკითხულობ ყველაფერს — კლასიკიდან ფანტასტიკამდე.";
        var newbie = NewUser("გიორგი", "კაპანაძე", "new@anbani.ge", UserRole.User, true, now.AddDays(-1));
        await db.SaveChangesAsync();

        // reader@anbani.ge: an annual subscriber with history
        AddPaidSubscription(reader, annual, now.AddDays(-35), now, rng, renewals: 0, canceled: false);
        // new@anbani.ge: fresh account, no subscription — perfect for trying the free trial

        // made-up readers so the admin dashboard has data
        var people = new List<User>();
        for (var i = 0; i < 38; i++)
        {
            var fi = rng.Next(FirstNames.Length);
            var created = now.AddDays(-rng.Next(0, 75)).AddMinutes(-rng.Next(0, 1440));
            var email = $"{Latin[fi]}.{(char)('a' + rng.Next(26))}{rng.Next(10, 99)}@example.com";
            if (people.Any(p => p.Email == email)) email = $"{Latin[fi]}{i}@example.com";
            var u = NewUser(FirstNames[fi], LastNames[rng.Next(LastNames.Length)], email, UserRole.User, false, created);
            u.IsVerified = rng.NextDouble() < 0.85;
            if (!u.IsVerified) u.VerifiedAt = null;
            people.Add(u);
        }
        await db.SaveChangesAsync();

        foreach (var u in people.Where(p => p.IsVerified))
        {
            var roll = rng.NextDouble();
            var age = (now - u.CreatedAt).TotalDays;
            if (roll < 0.22 && age < 7) AddTrial(u, rng.NextDouble() < 0.5 ? monthly : annual, u.CreatedAt.AddHours(2), expired: false);
            else if (roll < 0.40) AddTrial(u, monthly, u.CreatedAt.AddHours(3), expired: age >= 7);
            else if (roll < 0.80)
            {
                var plan = rng.NextDouble() < 0.6 ? monthly : annual;
                var start = u.CreatedAt.AddDays(rng.Next(0, Math.Max(1, (int)Math.Min(age, 20))));
                AddPaidSubscription(u, plan, start, now, rng, renewals: -1, canceled: rng.NextDouble() < 0.15);
            }
        }

        // reading, favorites, reviews
        var readers = people.Where(p => p.IsVerified).Append(reader).ToList();
        foreach (var u in readers)
        {
            foreach (var book in books.OrderBy(_ => rng.Next()).Take(rng.Next(1, 6)))
            {
                var started = u.CreatedAt.AddDays(rng.NextDouble() * Math.Max(1, (now - u.CreatedAt).TotalDays));
                var finished = rng.NextDouble() < 0.3;
                var page = finished ? book.Pages : Math.Max(4, (int)(book.Pages * rng.NextDouble() * 0.8));
                var last = started.AddDays(rng.NextDouble() * Math.Max(0.1, (now - started).TotalDays));
                db.ReadingProgress.Add(new ReadingProgress
                {
                    TenantId = key.Id, UserId = u.Id, BookId = book.Id, CurrentPage = page, TotalPages = book.Pages,
                    Status = finished ? ReadingStatus.Finished : ReadingStatus.Reading, StartedAt = started, LastReadAt = last,
                    FinishedAt = finished ? last : null,
                });
                // spread the pages over a few days of activity
                var days = rng.Next(1, 6);
                for (var d = 0; d < days; d++)
                {
                    var day = DateOnly.FromDateTime(last.AddDays(-d * rng.Next(1, 3)));
                    var existing = db.ReadingLogs.Local.FirstOrDefault(l => l.UserId == u.Id && l.Day == day);
                    var pages = Math.Max(1, page / days);
                    if (existing is null) db.ReadingLogs.Add(new ReadingLog { TenantId = key.Id, UserId = u.Id, Day = day, Pages = pages });
                    else existing.Pages += pages;
                }
                if (rng.NextDouble() < 0.35)
                    db.Favorites.Add(new Favorite { TenantId = key.Id, UserId = u.Id, BookId = book.Id, CreatedAt = last });
                if (rng.NextDouble() < 0.4)
                {
                    var rating = rng.NextDouble() switch { < 0.5 => 5, < 0.84 => 4, < 0.96 => 3, _ => 2 };
                    var pool = book.Language == "en" && rng.NextDouble() < 0.6 ? CommentsEn : CommentsKa;
                    db.Reviews.Add(new Review
                    {
                        TenantId = key.Id, UserId = u.Id, BookId = book.Id, Rating = rating,
                        Comment = rng.NextDouble() < 0.85 ? pool[rng.Next(pool.Length)] : "",
                        CreatedAt = last, UpdatedAt = last,
                    });
                }
            }
        }
        await db.SaveChangesAsync();
        logger.LogInformation("Demo sandbox seeded: {Users} users", readers.Count + 2);
    }

    private void AddTrial(User u, Plan plan, DateTime start, bool expired)
    {
        u.HasUsedTrial = true;
        var end = start.AddDays(plan.TrialDays);
        db.Subscriptions.Add(new Subscription
        {
            TenantId = u.TenantId, UserId = u.Id, PlanId = plan.Id, IsTrial = !expired,
            Status = expired ? SubscriptionStatus.Expired : SubscriptionStatus.Trialing,
            StartedAt = start, CurrentPeriodStart = start, CurrentPeriodEnd = end, TrialEndsAt = end,
            EndedAt = expired ? end : null, CreatedAt = start, UpdatedAt = start,
        });
    }

    private void AddPaidSubscription(User u, Plan plan, DateTime start, DateTime now, Random rng, int renewals, bool canceled)
    {
        u.HasUsedTrial = true;
        var card = FakePaymentGateway.TestCards[rng.Next(2)];
        var periodStart = start;
        var periodEnd = SubscriptionService.AddInterval(start, plan.Interval);
        AddPayment(u, plan, periodStart, periodStart, periodEnd, PaymentKind.Subscription, card, null);
        while (periodEnd <= now)
        {
            periodStart = periodEnd;
            periodEnd = SubscriptionService.AddInterval(periodStart, plan.Interval);
            AddPayment(u, plan, periodStart, periodStart, periodEnd, PaymentKind.Renewal, card, null);
        }
        if (rng.NextDouble() < 0.12) AddPayment(u, plan, start.AddMinutes(-3), null, null, PaymentKind.Subscription, FakePaymentGateway.TestCards[3], "INSUFFICIENT_FUNDS");
        db.Subscriptions.Add(new Subscription
        {
            TenantId = u.TenantId, UserId = u.Id, PlanId = plan.Id,
            Status = canceled ? SubscriptionStatus.Canceled : SubscriptionStatus.Active,
            StartedAt = start, CurrentPeriodStart = periodStart, CurrentPeriodEnd = periodEnd,
            CancelAtPeriodEnd = canceled, CanceledAt = canceled ? now.AddDays(-rng.Next(1, 5)) : null,
            CardBrand = card.Brand, CardLast4 = card.Number[^4..], CardExpMonth = 12, CardExpYear = 2030,
            CardHolder = $"{u.FirstName} {u.LastName}", CardBehavior = card.Behavior,
            CreatedAt = start, UpdatedAt = start,
        });
    }

    private void AddPayment(User u, Plan plan, DateTime at, DateTime? from, DateTime? to, PaymentKind kind, TestCard card, string? failure) =>
        db.Payments.Add(new Payment
        {
            TenantId = u.TenantId, UserId = u.Id, PlanId = plan.Id,
            InvoiceNumber = $"ANB-{at:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}",
            AmountMinor = plan.PriceMinor, Currency = plan.Currency,
            Status = failure is null ? PaymentStatus.Succeeded : PaymentStatus.Failed, Kind = kind, FailureCode = failure,
            CardBrand = card.Brand, CardLast4 = card.Number[^4..], PeriodStart = from, PeriodEnd = to, CreatedAt = at,
        });

    /// <summary>Deletes everything that belongs to one sandbox (the API key itself stays).</summary>
    public async Task WipeTenantAsync(int tenantId)
    {
        await db.Emails.IgnoreQueryFilters().Where(x => x.TenantId == tenantId).ExecuteDeleteAsync();
        await db.Payments.IgnoreQueryFilters().Where(x => x.TenantId == tenantId).ExecuteDeleteAsync();
        await db.Reviews.IgnoreQueryFilters().Where(x => x.TenantId == tenantId).ExecuteDeleteAsync();
        await db.Favorites.IgnoreQueryFilters().Where(x => x.TenantId == tenantId).ExecuteDeleteAsync();
        await db.ReadingProgress.IgnoreQueryFilters().Where(x => x.TenantId == tenantId).ExecuteDeleteAsync();
        await db.ReadingLogs.IgnoreQueryFilters().Where(x => x.TenantId == tenantId).ExecuteDeleteAsync();
        await db.Subscriptions.IgnoreQueryFilters().Where(x => x.TenantId == tenantId).ExecuteDeleteAsync();
        await db.Users.IgnoreQueryFilters().Where(x => x.TenantId == tenantId).ExecuteDeleteAsync();
        await db.Books.IgnoreQueryFilters().Where(x => x.TenantId == tenantId).ExecuteDeleteAsync();
        await db.Categories.IgnoreQueryFilters().Where(x => x.TenantId == tenantId).ExecuteDeleteAsync();
    }
}
