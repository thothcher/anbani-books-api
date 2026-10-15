using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using BooksApi.Data;
using BooksApi.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace BooksApi.Services;

public sealed record IssuedTokens(string AccessToken, string RefreshToken, int ExpiresIn, DateTime AccessTokenExpiresAt);

/// <summary>
/// Access token: a JWT valid for 15 minutes (claims: sub, tid = sandbox, role, email, name).
/// Refresh token: a random string valid for 30 days, stored only as a SHA-256 hash, and
/// rotated on every use (the old one stops working).
/// </summary>
public sealed class TokenService(AppDbContext db, IOptions<JwtOptions> options, IClock clock)
{
    public const string TenantClaim = "tid";

    private JwtOptions O => options.Value;

    public static SymmetricSecurityKey SigningKey(string secret) => new(Encoding.UTF8.GetBytes(secret));

    public async Task<IssuedTokens> IssueAsync(User user)
    {
        var now = clock.UtcNow;
        var expires = now.AddMinutes(O.AccessTokenMinutes);
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = O.Issuer,
            Audience = O.Audience,
            IssuedAt = now,
            NotBefore = now,
            Expires = expires,
            SigningCredentials = new SigningCredentials(SigningKey(O.Secret), SecurityAlgorithms.HmacSha256),
            Subject = new ClaimsIdentity(
            [
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim(TenantClaim, user.TenantId.ToString()),
                new Claim("role", user.Role.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, user.Email),
                new Claim(JwtRegisteredClaimNames.GivenName, user.FirstName),
                new Claim(JwtRegisteredClaimNames.FamilyName, user.LastName),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            ]),
        };
        var access = new JsonWebTokenHandler().CreateToken(descriptor);

        var refresh = WebEncode(RandomNumberGenerator.GetBytes(48));
        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = Hash(refresh),
            CreatedAt = now,
            ExpiresAt = now.AddDays(O.RefreshTokenDays),
        });
        await db.SaveChangesAsync();
        return new IssuedTokens(access, refresh, O.AccessTokenMinutes * 60, expires);
    }

    /// <summary>Validates a refresh token and revokes it (rotation). Throws 401 when unusable.</summary>
    public async Task<User> RedeemAsync(string refreshToken)
    {
        var hash = Hash(refreshToken);
        var token = await db.RefreshTokens.Include(t => t.User).FirstOrDefaultAsync(t => t.TokenHash == hash);
        if (token is null || token.RevokedAt is not null || token.ExpiresAt <= clock.UtcNow)
            throw new ApiException(401, "INVALID_REFRESH_TOKEN");
        token.RevokedAt = clock.UtcNow;
        await db.SaveChangesAsync();
        return token.User;
    }

    public async Task RevokeAsync(string refreshToken)
    {
        var hash = Hash(refreshToken);
        var token = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash);
        if (token is { RevokedAt: null })
        {
            token.RevokedAt = clock.UtcNow;
            await db.SaveChangesAsync();
        }
    }

    /// <summary>Signs the user out everywhere (after a password reset, for example).</summary>
    public Task RevokeAllAsync(int userId) =>
        db.RefreshTokens.Where(t => t.UserId == userId && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, clock.UtcNow));

    public static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    private static string WebEncode(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
