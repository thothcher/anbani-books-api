using System.Security.Cryptography;
using System.Text;
using BooksApi.Data;
using BooksApi.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace BooksApi.Services;

/// <summary>6-digit one-time codes for e-mail verification and password reset (valid 15 minutes, 5 attempts).</summary>
public sealed class CodeService(AppDbContext db, IClock clock)
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(15);
    public static readonly TimeSpan ResendInterval = TimeSpan.FromSeconds(60);
    public const int MaxAttempts = 5;

    public async Task<string> CreateAsync(User user, CodePurpose purpose)
    {
        var now = clock.UtcNow;
        // only the newest code is valid
        await db.VerificationCodes.Where(c => c.UserId == user.Id && c.Purpose == purpose && c.ConsumedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.ConsumedAt, now));

        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        db.VerificationCodes.Add(new VerificationCode
        {
            UserId = user.Id,
            Purpose = purpose,
            CodeHash = Hash(user.Id, purpose, code),
            CreatedAt = now,
            ExpiresAt = now + Lifetime,
        });
        await db.SaveChangesAsync();
        return code;
    }

    public async Task<bool> CanResendAsync(User user, CodePurpose purpose)
    {
        var last = await db.VerificationCodes.Where(c => c.UserId == user.Id && c.Purpose == purpose)
            .OrderByDescending(c => c.CreatedAt).Select(c => (DateTime?)c.CreatedAt).FirstOrDefaultAsync();
        return last is null || clock.UtcNow - last.Value >= ResendInterval;
    }

    /// <summary>Checks a code and marks it as used. Throws INVALID_CODE / CODE_EXPIRED / TOO_MANY_ATTEMPTS.</summary>
    public async Task ConsumeAsync(User user, CodePurpose purpose, string code)
    {
        var current = await db.VerificationCodes
            .Where(c => c.UserId == user.Id && c.Purpose == purpose && c.ConsumedAt == null)
            .OrderByDescending(c => c.CreatedAt).FirstOrDefaultAsync();
        if (current is null) throw new ApiException(400, "INVALID_CODE");
        if (current.ExpiresAt <= clock.UtcNow) throw new ApiException(400, "CODE_EXPIRED");
        if (current.Attempts >= MaxAttempts) throw new ApiException(429, "TOO_MANY_ATTEMPTS");

        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.ASCII.GetBytes(current.CodeHash), Encoding.ASCII.GetBytes(Hash(user.Id, purpose, code.Trim()))))
        {
            current.Attempts++;
            await db.SaveChangesAsync();
            var left = MaxAttempts - current.Attempts;
            throw left <= 0 ? new ApiException(429, "TOO_MANY_ATTEMPTS") : new ApiException(400, "INVALID_CODE") { Extensions = { ["attemptsLeft"] = left } };
        }
        current.ConsumedAt = clock.UtcNow;
        await db.SaveChangesAsync();
    }

    private static string Hash(int userId, CodePurpose purpose, string code) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{userId}:{purpose}:{code}")));
}
