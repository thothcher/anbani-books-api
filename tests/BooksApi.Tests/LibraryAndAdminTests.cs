using System.Net.Http.Headers;

namespace BooksApi.Tests;

public class LibraryAndAdminTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static async Task<int> FirstBookAsync(Sandbox s) => (await s.GetAsync("/api/books?q=frankenstein")).GetProperty("items")[0].Int("id");

    [Fact]
    public async Task Favorites_are_idempotent_and_show_up_in_lists()
    {
        var s = await Sandbox.CreateAsync(factory);
        await s.RegisterAsync("fav@example.com");
        var id = await FirstBookAsync(s);
        await s.PostAsync($"/api/library/favorites/{id}");
        await s.PostAsync($"/api/library/favorites/{id}"); // twice is fine
        Assert.Equal(1, (await s.GetAsync("/api/library/favorites")).GetArrayLength());
        Assert.True((await s.GetAsync($"/api/books/{id}")).Bool("isFavorite"));
        Assert.False((await s.JsonAsync(HttpMethod.Delete, $"/api/library/favorites/{id}")).Bool("isFavorite"));
    }

    [Fact]
    public async Task Progress_is_saved_and_the_last_page_finishes_the_book()
    {
        var s = await Sandbox.CreateAsync(factory);
        await s.RegisterAsync("progress@example.com");
        var id = await FirstBookAsync(s);
        Assert.Equal("SUBSCRIPTION_REQUIRED", (await s.PutAsync($"/api/library/progress/{id}", new { currentPage = 3 }, 402)).Code());

        await s.PostAsync("/api/subscription/trial", new { planId = 1 });
        var p = await s.PutAsync($"/api/library/progress/{id}", new { currentPage = 30 });
        Assert.Equal("reading", p.Str("status"));
        Assert.Equal(30, (await s.GetAsync($"/api/books/{id}/read")).Int("lastPage"));

        var pages = (await s.GetAsync($"/api/books/{id}")).Int("pages");
        await s.PutAsync($"/api/library/progress/{id}", new { currentPage = pages + 1 }, 400);
        var done = await s.PutAsync($"/api/library/progress/{id}", new { currentPage = pages });
        Assert.Equal("finished", done.Str("status"));
        Assert.Equal(1, (await s.GetAsync("/api/library/progress?status=finished")).GetArrayLength());

        var stats = await s.GetAsync("/api/library/stats");
        Assert.Equal(84, stats.GetProperty("activity").GetArrayLength());
        Assert.True(stats.Int("pagesRead") > 0);
    }

    [Fact]
    public async Task One_review_per_user_and_it_changes_the_rating()
    {
        var s = await Sandbox.CreateAsync(factory);
        await s.RegisterAsync("review@example.com");
        var id = await FirstBookAsync(s);
        var before = await s.GetAsync($"/api/books/{id}");

        await s.PostAsync($"/api/books/{id}/reviews", new { rating = 0 }, 400);
        var review = await s.PostAsync($"/api/books/{id}/reviews", new { rating = 1, comment = "Not for me." }, 201);
        Assert.True(review.Bool("isMine"));
        Assert.Equal("ALREADY_REVIEWED", (await s.PostAsync($"/api/books/{id}/reviews", new { rating = 5 }, 409)).Code());

        var after = await s.GetAsync($"/api/books/{id}");
        Assert.Equal(before.Int("ratingCount") + 1, after.Int("ratingCount"));

        await s.PutAsync($"/api/reviews/{review.Int("id")}", new { rating = 4, comment = "Better on a second read." });
        Assert.Equal(1, (await s.GetAsync($"/api/books/{id}/reviews?mine=true")).Int("totalItems"));

        await s.RegisterAsync("other@example.com");
        Assert.Equal("NOT_YOUR_REVIEW", (await s.PutAsync($"/api/reviews/{review.Int("id")}", new { rating = 5 }, 403)).Code());
    }

    [Fact]
    public async Task Only_admins_reach_the_admin_endpoints()
    {
        var s = await Sandbox.CreateAsync(factory);
        await s.RegisterAsync("boss@example.com");      // admin
        await s.GetAsync("/api/admin/stats");
        await s.RegisterAsync("reader@example.com");    // user
        Assert.Equal("ADMIN_ONLY", (await s.GetAsync("/api/admin/stats", expect: 403)).Code());
        await s.PostAsync("/api/categories", new { name = "Nope" }, 403);
    }

    [Fact]
    public async Task Admin_publishes_a_book_that_only_its_own_sandbox_can_see()
    {
        var s = await Sandbox.CreateAsync(factory);
        await s.RegisterAsync("editor@example.com");
        var category = await s.PostAsync("/api/categories", new { name = "პროგრამირება", nameEn = "Programming" }, 201);
        Assert.Equal("CATEGORY_EXISTS", (await s.PostAsync("/api/categories", new { name = "პროგრამირება" }, 409)).Code());

        var book = await s.PostAsync("/api/books", new
        {
            title = "JavaScript Basics",
            author = "Test Author",
            description = "A short book about variables, functions and arrays.",
            categoryId = category.Int("id"),
            language = "en",
            year = 2026,
        }, 201);
        var id = book.Int("id");
        Assert.False(book.Bool("isPublished"));
        Assert.Equal("PDF_REQUIRED", (await s.PutAsync($"/api/books/{id}", new { isPublished = true }, 409)).Code());

        // upload a real PDF (one of the built-in previews), the API counts pages and makes a preview
        var pdfPath = Path.Combine(AppContext.BaseDirectory, "SeedData", "books", "metamorphosis.pdf");
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(await File.ReadAllBytesAsync(pdfPath));
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        form.Add(file, "file", "book.pdf");
        var upload = await s.JsonAsync(HttpMethod.Put, $"/api/books/{id}/pdf", content: form);
        Assert.True(upload.Int("pages") > 10);
        Assert.True(upload.Bool("previewGenerated"));

        var notPdf = new MultipartFormDataContent { { new ByteArrayContent("hello"u8.ToArray()), "file", "fake.pdf" } };
        Assert.Equal("INVALID_PDF", (await s.JsonAsync(HttpMethod.Put, $"/api/books/{id}/pdf", content: notPdf, expect: 415)).Code());

        await s.PutAsync($"/api/books/{id}", new { isPublished = true });
        Assert.Equal("CATEGORY_NOT_EMPTY", (await s.DeleteAsync($"/api/categories/{category.Int("id")}", expect: 409)).Code());

        // a reader of the same sandbox sees it; another sandbox does not
        await s.RegisterAsync("someone@example.com");
        Assert.Equal(1, (await s.GetAsync("/api/books?q=javascript")).Int("totalItems"));
        var other = await Sandbox.CreateAsync(factory);
        Assert.Equal(0, (await other.GetAsync("/api/books?q=javascript")).Int("totalItems"));
        await other.GetAsync($"/api/books/{id}", expect: 404);

        // back as the admin: built-in books are read-only, own books can be deleted
        s.Token = null;
        s.Remember(await s.PostAsync("/api/auth/login", new { email = "editor@example.com", password = Sandbox.Password }));
        var system = (await s.GetAsync("/api/books?q=dracula")).GetProperty("items")[0].Int("id");
        Assert.Equal("SYSTEM_RESOURCE", (await s.DeleteAsync($"/api/books/{system}", expect: 403)).Code());
        await s.DeleteAsync($"/api/books/{id}");
    }

    [Fact]
    public async Task Admin_manages_users_and_sees_the_numbers()
    {
        var s = await Sandbox.CreateAsync(factory);
        var admin = await s.RegisterAsync("owner@example.com");
        var adminToken = s.Token;
        var user = await s.RegisterAsync("customer@example.com");
        await s.PostAsync("/api/subscription/checkout", new { planId = 1, card = Sandbox.Card("4242424242424242") });
        s.Token = adminToken;

        var stats = await s.GetAsync("/api/admin/stats");
        Assert.Equal(2, stats.GetProperty("users").Int("total"));
        Assert.Equal(1, stats.GetProperty("subscriptions").Int("active"));
        Assert.Equal(12.99m, stats.GetProperty("revenue").GetProperty("mrr").GetDecimal());
        Assert.Equal(14, stats.GetProperty("signups").GetArrayLength());

        var active = await s.GetAsync("/api/admin/users?status=active");
        Assert.Equal(1, active.Int("totalItems"));

        var granted = await s.PostAsync($"/api/admin/users/{admin.Int("id")}/grant", new { planId = 2, days = 30 });
        Assert.True(granted.Bool("isComplimentary"));

        Assert.Equal("CANNOT_CHANGE_SELF", (await s.PutAsync($"/api/admin/users/{admin.Int("id")}/role", new { role = "user" }, 409)).Code());
        await s.PutAsync($"/api/admin/users/{user.Int("id")}/role", new { role = "admin" });
        await s.DeleteAsync($"/api/admin/users/{user.Int("id")}");
        Assert.Equal(1, (await s.GetAsync("/api/admin/users")).Int("totalItems"));
    }

    [Fact]
    public async Task Teacher_endpoints_need_the_secret()
    {
        var http = factory.CreateClient();
        Assert.Equal(401, (int)(await http.GetAsync("/api/teacher/keys")).StatusCode);
        var req = new HttpRequestMessage(HttpMethod.Get, "/api/teacher/keys");
        req.Headers.Add("X-Teacher-Secret", "test-teacher-secret");
        Assert.Equal(200, (int)(await http.SendAsync(req)).StatusCode);
    }
}
