using BooksApi.Data;

namespace BooksApi.Contracts;

// Request DTOs use nullable properties on purpose: the API validates them itself and
// returns all field errors at once in the same format (400 VALIDATION_ERROR).

public sealed record RegisterRequest(string? FirstName, string? LastName, string? Email, string? Password);

public sealed record LoginRequest(string? Email, string? Password);

public sealed record RefreshRequest(string? RefreshToken);

public sealed record VerifyEmailRequest(string? Email, string? Code);

public sealed record EmailRequest(string? Email);

public sealed record ResetPasswordRequest(string? Email, string? Code, string? NewPassword);

public sealed record AuthResponse(
    string AccessToken,
    string RefreshToken,
    string TokenType,
    int ExpiresIn,
    DateTime AccessTokenExpiresAt,
    UserDto User);

public sealed record MessageResponse(string Message);

/// <summary>Short summary of the subscription, embedded in the user so the header can show a badge.</summary>
public sealed record SubscriptionSummaryDto(string Status, string? PlanCode, bool IsTrial, bool HasAccess, DateTime? AccessUntil);

public sealed record UserDto(
    int Id,
    string FirstName,
    string LastName,
    string FullName,
    string Email,
    UserRole Role,
    bool IsVerified,
    string? AvatarUrl,
    DateTime CreatedAt,
    SubscriptionSummaryDto Subscription);

public sealed record ProfileDto(
    int Id,
    string FirstName,
    string LastName,
    string FullName,
    string Email,
    UserRole Role,
    bool IsVerified,
    DateTime? VerifiedAt,
    string? Phone,
    string? Bio,
    string? AvatarUrl,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? LastLoginAt);

public sealed record UpdateProfileRequest(string? FirstName, string? LastName, string? Phone, string? Bio);

public sealed record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);

public sealed record AvatarResponse(string? AvatarUrl);
