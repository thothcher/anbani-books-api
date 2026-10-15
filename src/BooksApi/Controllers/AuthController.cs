using BooksApi.Contracts;
using BooksApi.Data;
using BooksApi.Infrastructure;
using BooksApi.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace BooksApi.Controllers;

/// <summary>Registration, login, tokens, e-mail verification and password reset.</summary>
[Route("api/auth")]
[Tags("Auth")]
[EnableRateLimiting("auth")]
public sealed class AuthController(
    TokenService tokens,
    CodeService codes,
    Mailer mailer,
    SubscriptionService subscriptions,
    DtoMapper map,
    IPasswordHasher<User> hasher,
    IClock clock) : ApiControllerBase
{
    /// <summary>ახალი მომხმარებლის რეგისტრაცია. აბრუნებს ტოკენებს და ელ-ფოსტაზე აგზავნის 6-ნიშნა კოდს.</summary>
    /// <remarks>The first user registered in a sandbox becomes its Admin.</remarks>
    [HttpPost("register")]
    [ProducesResponseType<AuthResponse>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Register(RegisterRequest req)
    {
        var v = NewValidator()
            .Required("firstName", req.FirstName).Length("firstName", req.FirstName, 2, 50)
            .Required("lastName", req.LastName).Length("lastName", req.LastName, 2, 50)
            .Required("email", req.Email).Email("email", req.Email)
            .Required("password", req.Password).Password("password", req.Password);
        v.ThrowIfInvalid();

        var email = req.Email!.Trim();
        var normalized = email.ToLowerInvariant();
        if (await Db.Users.AnyAsync(u => u.NormalizedEmail == normalized))
            throw new ApiException(409, "EMAIL_TAKEN", errors: new Dictionary<string, string[]> { ["email"] = [ErrorCatalog.Get("EMAIL_TAKEN", Lang).Message] });

        var now = clock.UtcNow;
        var user = new User
        {
            TenantId = Tenant.Require(),
            FirstName = req.FirstName!.Trim(),
            LastName = req.LastName!.Trim(),
            Email = email,
            NormalizedEmail = normalized,
            // the first account in a sandbox (or the first after every admin was deleted) runs it
            Role = await Db.Users.AnyAsync(u => u.Role == UserRole.Admin) ? UserRole.User : UserRole.Admin,
            CreatedAt = now,
            UpdatedAt = now,
            LastLoginAt = now,
        };
        user.PasswordHash = hasher.HashPassword(user, req.Password!);
        Db.Users.Add(user);
        await Db.SaveChangesAsync();

        var code = await codes.CreateAsync(user, CodePurpose.EmailVerification);
        await mailer.SendAsync(user.TenantId, user.Email, MailTemplates.VerifyEmail(Lang, user.FirstName, code));

        return StatusCode(201, await AuthResponseAsync(user));
    }

    /// <summary>შესვლა ელ-ფოსტით და პაროლით.</summary>
    [HttpPost("login")]
    [ProducesResponseType<AuthResponse>(StatusCodes.Status200OK)]
    public async Task<AuthResponse> Login(LoginRequest req)
    {
        NewValidator().Required("email", req.Email).Required("password", req.Password).ThrowIfInvalid();
        var normalized = req.Email!.Trim().ToLowerInvariant();
        var user = await Db.Users.FirstOrDefaultAsync(u => u.NormalizedEmail == normalized);
        if (user is null || hasher.VerifyHashedPassword(user, user.PasswordHash, req.Password!) == PasswordVerificationResult.Failed)
            throw new ApiException(401, "INVALID_CREDENTIALS");

        user.LastLoginAt = clock.UtcNow;
        await Db.SaveChangesAsync();
        return await AuthResponseAsync(user);
    }

    /// <summary>ახალი access token-ის მიღება refresh token-ით. ძველი refresh token უქმდება (rotation).</summary>
    [HttpPost("refresh")]
    [ProducesResponseType<AuthResponse>(StatusCodes.Status200OK)]
    public async Task<AuthResponse> Refresh(RefreshRequest req)
    {
        NewValidator().Required("refreshToken", req.RefreshToken).ThrowIfInvalid();
        var user = await tokens.RedeemAsync(req.RefreshToken!);
        return await AuthResponseAsync(user);
    }

    /// <summary>გასვლა: refresh token უქმდება.</summary>
    [HttpPost("logout")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Logout(RefreshRequest req)
    {
        if (!string.IsNullOrWhiteSpace(req.RefreshToken)) await tokens.RevokeAsync(req.RefreshToken);
        return NoContent();
    }

    /// <summary>ელ-ფოსტის დადასტურება წერილით მიღებული კოდით. აბრუნებს ახალ ტოკენებს.</summary>
    [HttpPost("verify-email")]
    [ProducesResponseType<AuthResponse>(StatusCodes.Status200OK)]
    public async Task<AuthResponse> VerifyEmail(VerifyEmailRequest req)
    {
        NewValidator().Required("email", req.Email).Email("email", req.Email).Required("code", req.Code).ThrowIfInvalid();
        var normalized = req.Email!.Trim().ToLowerInvariant();
        var user = await Db.Users.FirstOrDefaultAsync(u => u.NormalizedEmail == normalized)
                   ?? throw new ApiException(400, "INVALID_CODE");
        if (user.IsVerified) throw ApiException.Conflict("ALREADY_VERIFIED");

        await codes.ConsumeAsync(user, CodePurpose.EmailVerification, req.Code!);
        user.IsVerified = true;
        user.VerifiedAt = clock.UtcNow;
        user.UpdatedAt = clock.UtcNow;
        await Db.SaveChangesAsync();
        await mailer.SendAsync(user.TenantId, user.Email, MailTemplates.Welcome(Lang, user.FirstName));
        return await AuthResponseAsync(user);
    }

    /// <summary>დადასტურების კოდის თავიდან გაგზავნა (60 წამში ერთხელ).</summary>
    [HttpPost("resend-verification")]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status200OK)]
    public async Task<MessageResponse> ResendVerification(EmailRequest req)
    {
        NewValidator().Required("email", req.Email).Email("email", req.Email).ThrowIfInvalid();
        var normalized = req.Email!.Trim().ToLowerInvariant();
        var user = await Db.Users.FirstOrDefaultAsync(u => u.NormalizedEmail == normalized);
        if (user is { IsVerified: true }) throw ApiException.Conflict("ALREADY_VERIFIED");
        if (user is not null)
        {
            if (!await codes.CanResendAsync(user, CodePurpose.EmailVerification)) throw new ApiException(429, "RESEND_TOO_SOON");
            var code = await codes.CreateAsync(user, CodePurpose.EmailVerification);
            await mailer.SendAsync(user.TenantId, user.Email, MailTemplates.VerifyEmail(Lang, user.FirstName, code));
        }
        return new MessageResponse(Message(
            "თუ ასეთი ანგარიში არსებობს, ახალი კოდი გაიგზავნა.",
            "If an account with this email exists, a new code has been sent."));
    }

    /// <summary>პაროლის აღდგენის მოთხოვნა: ელ-ფოსტაზე იგზავნება 6-ნიშნა კოდი.</summary>
    /// <remarks>Always answers 200, so nobody can use it to find out which emails are registered.</remarks>
    [HttpPost("forgot-password")]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status200OK)]
    public async Task<MessageResponse> ForgotPassword(EmailRequest req)
    {
        NewValidator().Required("email", req.Email).Email("email", req.Email).ThrowIfInvalid();
        var normalized = req.Email!.Trim().ToLowerInvariant();
        var user = await Db.Users.FirstOrDefaultAsync(u => u.NormalizedEmail == normalized);
        if (user is not null && await codes.CanResendAsync(user, CodePurpose.PasswordReset))
        {
            var code = await codes.CreateAsync(user, CodePurpose.PasswordReset);
            await mailer.SendAsync(user.TenantId, user.Email, MailTemplates.PasswordReset(Lang, user.FirstName, code));
        }
        return new MessageResponse(Message(
            "თუ ასეთი ანგარიში არსებობს, აღდგენის კოდი გაიგზავნა ელ-ფოსტაზე.",
            "If an account with this email exists, a reset code has been sent."));
    }

    /// <summary>ახალი პაროლის დაყენება აღდგენის კოდით. ყველა სესია (refresh token) უქმდება.</summary>
    [HttpPost("reset-password")]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status200OK)]
    public async Task<MessageResponse> ResetPassword(ResetPasswordRequest req)
    {
        NewValidator()
            .Required("email", req.Email).Email("email", req.Email)
            .Required("code", req.Code)
            .Required("newPassword", req.NewPassword).Password("newPassword", req.NewPassword)
            .ThrowIfInvalid();
        var normalized = req.Email!.Trim().ToLowerInvariant();
        var user = await Db.Users.FirstOrDefaultAsync(u => u.NormalizedEmail == normalized)
                   ?? throw new ApiException(400, "INVALID_CODE");
        if (user.IsDemoAccount) throw ApiException.Forbidden("DEMO_ACCOUNT_LOCKED");

        await codes.ConsumeAsync(user, CodePurpose.PasswordReset, req.Code!);
        user.PasswordHash = hasher.HashPassword(user, req.NewPassword!);
        user.IsVerified = true; // they proved they own the mailbox
        user.VerifiedAt ??= clock.UtcNow;
        user.UpdatedAt = clock.UtcNow;
        await Db.SaveChangesAsync();
        await tokens.RevokeAllAsync(user.Id);
        return new MessageResponse(Message("პაროლი შეიცვალა. შედით ახალი პაროლით.", "Your password was changed. Sign in with the new password."));
    }

    private async Task<AuthResponse> AuthResponseAsync(User user)
    {
        var issued = await tokens.IssueAsync(user);
        var sub = await subscriptions.LoadAsync(user);
        return new AuthResponse(issued.AccessToken, issued.RefreshToken, "Bearer", issued.ExpiresIn, issued.AccessTokenExpiresAt,
            map.User(user, subscriptions.Describe(user, sub), sub));
    }
}
