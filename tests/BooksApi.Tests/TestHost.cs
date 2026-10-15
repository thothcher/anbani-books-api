using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace BooksApi.Tests;

/// <summary>The real API in memory, with its own temporary SQLite database and file storage.</summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public string Root { get; } = Path.Combine(Path.GetTempPath(), "booksapi-tests", Guid.NewGuid().ToString("N"));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        Directory.CreateDirectory(Root);
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Default", $"Data Source={Path.Combine(Root, "test.db")}");
        builder.UseSetting("Storage:Root", Path.Combine(Root, "storage"));
        builder.UseSetting("Jwt:Secret", "integration-tests-secret-0123456789-abcdefghij");
        builder.UseSetting("Sandbox:SeedDemoData", "false");
        builder.UseSetting("Sandbox:RequestsPerMinute", "100000");
        builder.UseSetting("Sandbox:AuthRequestsPerMinute", "100000");
        builder.UseSetting("Sandbox:KeysPerHour", "100000");
        builder.UseSetting("Teacher:Secret", "test-teacher-secret");
        builder.UseSetting("Hosting:WebAppPath", "");
        builder.UseSetting("Hosting:DocsPath", "");
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        try { Directory.Delete(Root, recursive: true); } catch (IOException) { /* SQLite may still hold the file */ }
    }
}

/// <summary>One student's sandbox (API key) with an optional signed-in user.</summary>
public sealed class Sandbox(HttpClient http, string apiKey)
{
    public const string Password = "Reading2026";
    public string ApiKey { get; } = apiKey;
    public string? Token { get; set; }
    public string? RefreshToken { get; set; }
    public HttpClient Http => http;

    public static async Task<Sandbox> CreateAsync(ApiFactory factory)
    {
        var http = factory.CreateClient();
        var res = await http.PostAsJsonAsync("/api/developer/keys", new { name = "Test Student", email = "student@example.com" });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        return new Sandbox(http, body.GetProperty("apiKey").GetString()!);
    }

    public Task<HttpResponseMessage> SendAsync(HttpMethod method, string url, object? body = null, bool auth = true, HttpContent? content = null)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Add("X-API-KEY", ApiKey);
        req.Headers.AcceptLanguage.ParseAdd("en");
        if (auth && Token is not null) req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Token);
        if (content is not null) req.Content = content;
        else if (body is not null) req.Content = JsonContent.Create(body);
        return http.SendAsync(req);
    }

    /// <summary>Sends a request and asserts the status code; returns the JSON body.</summary>
    public async Task<JsonElement> JsonAsync(HttpMethod method, string url, object? body = null, int expect = 200, HttpContent? content = null)
    {
        var res = await SendAsync(method, url, body, content: content);
        var text = await res.Content.ReadAsStringAsync();
        Assert.True((int)res.StatusCode == expect, $"{method} {url}: expected {expect}, got {(int)res.StatusCode}: {text}");
        return text.Length == 0 ? default : JsonDocument.Parse(text).RootElement.Clone();
    }

    public Task<JsonElement> GetAsync(string url, int expect = 200) => JsonAsync(HttpMethod.Get, url, null, expect);
    public Task<JsonElement> PostAsync(string url, object? body = null, int expect = 200) => JsonAsync(HttpMethod.Post, url, body ?? new { }, expect);
    public Task<JsonElement> PutAsync(string url, object? body = null, int expect = 200) => JsonAsync(HttpMethod.Put, url, body ?? new { }, expect);
    public Task<JsonElement> DeleteAsync(string url, int expect = 204) => JsonAsync(HttpMethod.Delete, url, null, expect);

    /// <summary>Registers a user, optionally confirms the e-mail with the code from the sandbox inbox, and signs in.</summary>
    public async Task<JsonElement> RegisterAsync(string email, bool verify = true)
    {
        Token = null;
        var reg = await PostAsync("/api/auth/register", new { firstName = "Test", lastName = "Reader", email, password = Password }, 201);
        Remember(reg);
        if (!verify) return reg.GetProperty("user");
        var verified = await PostAsync("/api/auth/verify-email", new { email, code = await LastCodeAsync(email) });
        Remember(verified);
        return verified.GetProperty("user");
    }

    public async Task<string> LastCodeAsync(string email)
    {
        var inbox = await GetAsync($"/api/sandbox/inbox?email={Uri.EscapeDataString(email)}");
        return inbox.GetProperty("items").EnumerateArray().First(m => m.GetProperty("code").ValueKind == JsonValueKind.String).GetProperty("code").GetString()!;
    }

    public void Remember(JsonElement auth)
    {
        Token = auth.GetProperty("accessToken").GetString();
        RefreshToken = auth.GetProperty("refreshToken").GetString();
    }

    public static object Card(string number) => new { number, holderName = "Test Reader", expMonth = 12, expYear = DateTime.UtcNow.Year + 3, cvc = "123" };
}

public static class JsonExtensions
{
    public static string Str(this JsonElement e, string name) => e.GetProperty(name).GetString()!;
    public static int Int(this JsonElement e, string name) => e.GetProperty(name).GetInt32();
    public static bool Bool(this JsonElement e, string name) => e.GetProperty(name).GetBoolean();
    public static string Code(this JsonElement e) => e.GetProperty("code").GetString()!;
}
