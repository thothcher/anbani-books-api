namespace BooksApi.Tests;

public class AuthTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task First_user_of_a_sandbox_is_admin_the_rest_are_users()
    {
        var s = await Sandbox.CreateAsync(factory);
        Assert.Equal("admin", (await s.RegisterAsync("first@example.com")).Str("role"));
        Assert.Equal("user", (await s.RegisterAsync("second@example.com")).Str("role"));
    }

    [Fact]
    public async Task Registration_validates_every_field_at_once()
    {
        var s = await Sandbox.CreateAsync(factory);
        var error = await s.PostAsync("/api/auth/register", new { firstName = "A", lastName = "", email = "not-an-email", password = "short" }, 400);
        var errors = error.GetProperty("errors");
        foreach (var field in new[] { "firstName", "lastName", "email", "password" }) Assert.True(errors.TryGetProperty(field, out _), field);
    }

    [Fact]
    public async Task The_same_email_cannot_register_twice_in_a_sandbox_but_can_in_another()
    {
        var a = await Sandbox.CreateAsync(factory);
        await a.RegisterAsync("same@example.com", verify: false);
        var dup = await a.PostAsync("/api/auth/register", new { firstName = "Test", lastName = "Reader", email = "SAME@example.com", password = Sandbox.Password }, 409);
        Assert.Equal("EMAIL_TAKEN", dup.Code());

        var b = await Sandbox.CreateAsync(factory);
        await b.RegisterAsync("same@example.com", verify: false); // separate sandbox, no conflict
    }

    [Fact]
    public async Task Verification_code_rules()
    {
        var s = await Sandbox.CreateAsync(factory);
        var user = await s.RegisterAsync("verify@example.com", verify: false);
        Assert.False(user.Bool("isVerified"));

        var wrong = await s.PostAsync("/api/auth/verify-email", new { email = "verify@example.com", code = "000000" }, 400);
        Assert.Equal("INVALID_CODE", wrong.Code());
        Assert.Equal(4, wrong.Int("attemptsLeft"));

        var ok = await s.PostAsync("/api/auth/verify-email", new { email = "verify@example.com", code = await s.LastCodeAsync("verify@example.com") });
        Assert.True(ok.GetProperty("user").Bool("isVerified"));

        var again = await s.PostAsync("/api/auth/verify-email", new { email = "verify@example.com", code = "123456" }, 409);
        Assert.Equal("ALREADY_VERIFIED", again.Code());
    }

    [Fact]
    public async Task Login_and_refresh_token_rotation()
    {
        var s = await Sandbox.CreateAsync(factory);
        await s.RegisterAsync("rotate@example.com");

        var bad = await s.PostAsync("/api/auth/login", new { email = "rotate@example.com", password = "WrongPass1" }, 401);
        Assert.Equal("INVALID_CREDENTIALS", bad.Code());

        var login = await s.PostAsync("/api/auth/login", new { email = "rotate@example.com", password = Sandbox.Password });
        var oldRefresh = login.Str("refreshToken");
        Assert.Equal(900, login.Int("expiresIn"));

        var refreshed = await s.PostAsync("/api/auth/refresh", new { refreshToken = oldRefresh });
        Assert.NotEqual(oldRefresh, refreshed.Str("refreshToken"));

        // the old refresh token was revoked by the rotation
        var reused = await s.PostAsync("/api/auth/refresh", new { refreshToken = oldRefresh }, 401);
        Assert.Equal("INVALID_REFRESH_TOKEN", reused.Code());
    }

    [Fact]
    public async Task Bad_tokens_are_rejected_even_on_public_endpoints()
    {
        var s = await Sandbox.CreateAsync(factory);
        s.Token = "not.a.jwt";
        Assert.Equal("TOKEN_INVALID", (await s.GetAsync("/api/books", expect: 401)).Code());

        s.Token = null;
        Assert.Equal("AUTH_REQUIRED", (await s.GetAsync("/api/users/me", expect: 401)).Code());
    }

    [Fact]
    public async Task A_token_only_works_with_its_own_api_key()
    {
        var a = await Sandbox.CreateAsync(factory);
        await a.RegisterAsync("tenant@example.com");
        var b = await Sandbox.CreateAsync(factory);
        b.Token = a.Token;
        Assert.Equal("TOKEN_WRONG_SANDBOX", (await b.GetAsync("/api/users/me", expect: 401)).Code());
    }

    [Fact]
    public async Task Password_reset_with_a_code_signs_out_everywhere()
    {
        var s = await Sandbox.CreateAsync(factory);
        await s.RegisterAsync("reset@example.com");
        var oldRefresh = s.RefreshToken;

        await s.PostAsync("/api/auth/forgot-password", new { email = "reset@example.com" });
        var code = await s.LastCodeAsync("reset@example.com");
        await s.PostAsync("/api/auth/reset-password", new { email = "reset@example.com", code, newPassword = "BrandNew2026" });

        await s.PostAsync("/api/auth/refresh", new { refreshToken = oldRefresh }, 401);
        await s.PostAsync("/api/auth/login", new { email = "reset@example.com", password = "BrandNew2026" });
    }

    [Fact]
    public async Task Profile_update_and_password_change()
    {
        var s = await Sandbox.CreateAsync(factory);
        await s.RegisterAsync("profile@example.com");
        var profile = await s.PutAsync("/api/users/profile", new { firstName = "Nino", lastName = "Beridze", phone = "+995 555 12 34 56", bio = "Reader" });
        Assert.Equal("+995 555 12 34 56", profile.Str("phone"));

        var wrong = await s.PutAsync("/api/users/change-password", new { currentPassword = "nope12345", newPassword = "Another2026" }, 400);
        Assert.Equal("WRONG_PASSWORD", wrong.Code());
        await s.PutAsync("/api/users/change-password", new { currentPassword = Sandbox.Password, newPassword = "Another2026" });
    }
}
