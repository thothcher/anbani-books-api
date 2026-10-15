using System.Net;
using System.Text.Json;

namespace BooksApi.Tests;

public class CatalogAndErrorsTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Health_is_reported()
    {
        var res = await factory.CreateClient().GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Contains("healthy", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Requests_without_an_api_key_get_a_problem_response()
    {
        var res = await factory.CreateClient().GetAsync("/api/books");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal("application/problem+json; charset=utf-8", res.Content.Headers.ContentType!.ToString());
        var body = JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("API_KEY_MISSING", body.Code());
        Assert.Equal(401, body.Int("status"));
        Assert.False(string.IsNullOrEmpty(body.Str("detail")));
    }

    [Fact]
    public async Task Catalog_has_the_built_in_library()
    {
        var s = await Sandbox.CreateAsync(factory);
        var page = await s.GetAsync("/api/books?pageSize=12");
        Assert.Equal(30, page.Int("totalItems"));
        Assert.Equal(3, page.Int("totalPages"));
        Assert.True(page.Bool("hasMore"));
        Assert.Equal(12, page.GetProperty("items").GetArrayLength());

        var categories = await s.GetAsync("/api/categories");
        Assert.Equal(9, categories.GetArrayLength());
        Assert.Equal(30, categories.EnumerateArray().Sum(c => c.Int("bookCount")));
    }

    [Fact]
    public async Task Search_filters_and_sorting_work_together()
    {
        var s = await Sandbox.CreateAsync(factory);
        var holmes = await s.GetAsync("/api/books?q=holmes");
        Assert.Equal(1, holmes.Int("totalItems"));

        var georgian = await s.GetAsync("/api/books?language=ka&pageSize=48");
        Assert.All(georgian.GetProperty("items").EnumerateArray(), b => Assert.Equal("ka", b.Str("language")));

        var free = await s.GetAsync("/api/books?isFree=true");
        Assert.All(free.GetProperty("items").EnumerateArray(), b => Assert.True(b.Bool("isFree")));

        var byTitle = await s.GetAsync("/api/books?sort=title&language=en&pageSize=48");
        var titles = byTitle.GetProperty("items").EnumerateArray().Select(b => b.Str("title")).ToList();
        Assert.Equal(titles.Order(StringComparer.Ordinal).ToList(), titles);

        var ancient = await s.GetAsync("/api/books?yearTo=0");
        Assert.Contains(ancient.GetProperty("items").EnumerateArray(), b => b.Str("title") == "The Art of War");
    }

    [Fact]
    public async Task Invalid_query_parameters_return_field_errors()
    {
        var s = await Sandbox.CreateAsync(factory);
        var error = await s.GetAsync("/api/books?sort=bogus&page=0&pageSize=500", expect: 400);
        Assert.Equal("VALIDATION_ERROR", error.Code());
        var errors = error.GetProperty("errors");
        Assert.True(errors.TryGetProperty("sort", out _));
        Assert.True(errors.TryGetProperty("page", out _));
        Assert.True(errors.TryGetProperty("pageSize", out _));
    }

    [Fact]
    public async Task Book_details_tell_the_client_what_the_user_may_do()
    {
        var s = await Sandbox.CreateAsync(factory);
        var list = await s.GetAsync("/api/books?q=dracula");
        var id = list.GetProperty("items")[0].Int("id");

        var guest = await s.GetAsync($"/api/books/{id}");
        Assert.Equal("loginRequired", guest.GetProperty("access").Str("reason"));
        Assert.True(guest.GetProperty("chapters").GetArrayLength() > 10);
        Assert.Equal(JsonValueKind.Null, guest.GetProperty("isFavorite").ValueKind);

        var preview = await s.Http.GetAsync(guest.Str("previewUrl"));
        Assert.Equal("application/pdf", preview.Content.Headers.ContentType!.MediaType);
        var cover = await s.Http.GetAsync(guest.Str("coverUrl"));
        Assert.Equal("image/svg+xml", cover.Content.Headers.ContentType!.MediaType);

        await s.RegisterAsync("details@example.com");
        var user = await s.GetAsync($"/api/books/{id}");
        Assert.Equal("subscriptionRequired", user.GetProperty("access").Str("reason"));
        Assert.False(user.Bool("isFavorite"));

        await s.GetAsync("/api/books/99999", expect: 404);
    }

    [Fact]
    public async Task Unknown_routes_and_methods_use_the_same_error_format()
    {
        var s = await Sandbox.CreateAsync(factory);
        Assert.Equal("NOT_FOUND", (await s.GetAsync("/api/nothing-here", expect: 404)).Code());
        Assert.Equal("METHOD_NOT_ALLOWED", (await s.JsonAsync(HttpMethod.Delete, "/api/plans", expect: 405)).Code());
    }

    [Fact]
    public async Task Broken_json_is_a_400_not_a_500()
    {
        var s = await Sandbox.CreateAsync(factory);
        var content = new StringContent("{ \"email\": ", System.Text.Encoding.UTF8, "application/json");
        var error = await s.JsonAsync(HttpMethod.Post, "/api/auth/login", content: content, expect: 400);
        Assert.Equal("INVALID_JSON", error.Code());
    }

    [Fact]
    public async Task Openapi_document_describes_every_controller_route()
    {
        var res = await factory.CreateClient().GetAsync("/openapi/v1.json");
        var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement;
        var paths = doc.GetProperty("paths").EnumerateObject().Select(p => p.Name).ToHashSet();
        foreach (var expected in new[]
                 {
                     "/api/auth/register", "/api/auth/refresh", "/api/books", "/api/books/{id}/read", "/api/subscription/checkout",
                     "/api/library/progress/{bookId}", "/api/admin/stats", "/api/sandbox/time-travel", "/api/developer/keys",
                 })
            Assert.Contains(expected, paths);
        Assert.True(doc.GetProperty("components").GetProperty("securitySchemes").TryGetProperty("ApiKey", out _));
    }
}
