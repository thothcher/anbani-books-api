using BooksApi.Contracts;
using BooksApi.Data;
using BooksApi.Infrastructure;
using BooksApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BooksApi.Controllers;

/// <summary>The signed-in user's own account.</summary>
[Route("api/users")]
[Tags("Users")]
[Authorize]
public sealed class UsersController(
    SubscriptionService subscriptions,
    DtoMapper map,
    TokenService tokens,
    FileStorage storage,
    IPasswordHasher<User> hasher,
    IOptions<SandboxOptions> sandbox,
    IClock clock) : ApiControllerBase
{
    /// <summary>ავტორიზებული მომხმარებლის მოკლე ინფორმაცია (+ გამოწერის სტატუსი).</summary>
    [HttpGet("me")]
    public async Task<UserDto> Me()
    {
        var user = await CurrentUserAsync();
        var sub = await subscriptions.LoadAsync(user);
        return map.User(user, subscriptions.Describe(user, sub), sub);
    }

    /// <summary>სრული პროფილი.</summary>
    [HttpGet("profile")]
    public async Task<ProfileDto> GetProfile() => map.Profile(await CurrentUserAsync());

    /// <summary>პროფილის რედაქტირება (სახელი, გვარი, ტელეფონი, ბიო).</summary>
    [HttpPut("profile")]
    public async Task<ProfileDto> UpdateProfile(UpdateProfileRequest req)
    {
        var v = NewValidator()
            .Required("firstName", req.FirstName).Length("firstName", req.FirstName, 2, 50)
            .Required("lastName", req.LastName).Length("lastName", req.LastName, 2, 50)
            .MaxLength("bio", req.Bio, 300);
        if (!string.IsNullOrWhiteSpace(req.Phone))
            v.Must(System.Text.RegularExpressions.Regex.IsMatch(req.Phone.Trim(), @"^\+?[0-9 ()\-]{6,20}$"), "phone",
                "ტელეფონის ნომერი არასწორია (მაგ. +995 555 12 34 56).", "Invalid phone number (e.g. +995 555 12 34 56).");
        v.ThrowIfInvalid();

        var user = await CurrentUserAsync();
        user.FirstName = req.FirstName!.Trim();
        user.LastName = req.LastName!.Trim();
        user.Phone = string.IsNullOrWhiteSpace(req.Phone) ? null : req.Phone.Trim();
        user.Bio = string.IsNullOrWhiteSpace(req.Bio) ? null : req.Bio.Trim();
        user.UpdatedAt = clock.UtcNow;
        await Db.SaveChangesAsync();
        return map.Profile(user);
    }

    /// <summary>პაროლის შეცვლა (საჭიროა მიმდინარე პაროლი). სხვა სესიები უქმდება.</summary>
    [HttpPut("change-password")]
    public async Task<MessageResponse> ChangePassword(ChangePasswordRequest req)
    {
        NewValidator()
            .Required("currentPassword", req.CurrentPassword)
            .Required("newPassword", req.NewPassword).Password("newPassword", req.NewPassword)
            .Must(req.NewPassword is null || req.NewPassword != req.CurrentPassword, "newPassword",
                "ახალი პაროლი ძველისგან უნდა განსხვავდებოდეს.", "The new password must be different from the current one.")
            .ThrowIfInvalid();
        var user = await CurrentUserAsync();
        if (user.IsDemoAccount) throw ApiException.Forbidden("DEMO_ACCOUNT_LOCKED");
        if (hasher.VerifyHashedPassword(user, user.PasswordHash, req.CurrentPassword!) == PasswordVerificationResult.Failed)
            throw new ApiException(400, "WRONG_PASSWORD", errors: new Dictionary<string, string[]> { ["currentPassword"] = [ErrorCatalog.Get("WRONG_PASSWORD", Lang).Message] });

        user.PasswordHash = hasher.HashPassword(user, req.NewPassword!);
        user.UpdatedAt = clock.UtcNow;
        await Db.SaveChangesAsync();
        await tokens.RevokeAllAsync(user.Id);
        return new MessageResponse(Message("პაროლი შეიცვალა.", "Your password was changed."));
    }

    /// <summary>ავატარის ატვირთვა (multipart/form-data, ველი "file": JPG / PNG / WEBP).</summary>
    [HttpPost("avatar")]
    [Consumes("multipart/form-data")]
    public async Task<AvatarResponse> UploadAvatar(IFormFile? file)
    {
        var user = await CurrentUserAsync();
        Uploads.Require(file, sandbox.Value.MaxImageMb * 1024L * 1024);
        await using var stream = file!.OpenReadStream();
        var (ext, _) = Uploads.DetectImage(stream);
        if (storage.TenantUsage(user.TenantId) + file.Length > sandbox.Value.StorageQuotaMb * 1024L * 1024)
            throw new ApiException(413, "STORAGE_QUOTA_EXCEEDED");

        var path = await storage.SaveAsync(user.TenantId, "avatars", stream, ext);
        storage.Delete(user.AvatarFile);
        user.AvatarFile = path;
        user.AvatarKey = Guid.NewGuid().ToString("N");
        user.UpdatedAt = clock.UtcNow;
        await Db.SaveChangesAsync();
        return new AvatarResponse(HttpContext.RequestServices.GetRequiredService<Urls>().Avatar(user));
    }

    /// <summary>ავატარის წაშლა.</summary>
    [HttpDelete("avatar")]
    public async Task<AvatarResponse> DeleteAvatar()
    {
        var user = await CurrentUserAsync();
        storage.Delete(user.AvatarFile);
        user.AvatarFile = null;
        user.AvatarKey = null;
        user.UpdatedAt = clock.UtcNow;
        await Db.SaveChangesAsync();
        return new AvatarResponse(null);
    }

    /// <summary>ანგარიშის სამუდამოდ წაშლა (ყველა მონაცემით).</summary>
    [HttpDelete("me")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> DeleteAccount()
    {
        var user = await CurrentUserAsync();
        if (user.IsDemoAccount) throw ApiException.Forbidden("DEMO_ACCOUNT_LOCKED");
        if (user.Role == UserRole.Admin && !await Db.Users.AnyAsync(u => u.Role == UserRole.Admin && u.Id != user.Id)
                                       && await Db.Users.AnyAsync(u => u.Id != user.Id))
            throw ApiException.Conflict("LAST_ADMIN");

        storage.Delete(user.AvatarFile);
        await Db.Reviews.Where(r => r.UserId == user.Id).ExecuteDeleteAsync();
        await Db.Payments.Where(p => p.UserId == user.Id).ExecuteDeleteAsync();
        Db.Users.Remove(user);
        await Db.SaveChangesAsync();
        return NoContent();
    }
}
