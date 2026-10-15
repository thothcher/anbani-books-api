using BooksApi.Data;
using BooksApi.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BooksApi.Controllers;

[ApiController]
[Produces("application/json")]
public abstract class ApiControllerBase : ControllerBase
{
    protected AppDbContext Db => HttpContext.RequestServices.GetRequiredService<AppDbContext>();
    protected TenantContext Tenant => HttpContext.RequestServices.GetRequiredService<TenantContext>();
    protected Lang Lang => HttpContext.GetLang();
    protected Validator NewValidator() => new(Lang);

    protected int? CurrentUserId => int.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : null;

    /// <summary>The signed-in user, loaded fresh from the database (the token could belong to a deleted account).</summary>
    protected async Task<User> CurrentUserAsync()
    {
        var id = CurrentUserId ?? throw new ApiException(401, "AUTH_REQUIRED");
        return await Db.Users.FirstOrDefaultAsync(u => u.Id == id) ?? throw new ApiException(401, "USER_NOT_FOUND");
    }

    /// <summary>For endpoints that work for guests too but return personal data when signed in.</summary>
    protected async Task<User?> OptionalUserAsync() =>
        CurrentUserId is { } id ? await Db.Users.FirstOrDefaultAsync(u => u.Id == id) : null;

    /// <summary>
    /// Admin check against the database, not the token: if an admin removes someone's role,
    /// it takes effect immediately instead of when their 15-minute token expires.
    /// </summary>
    protected async Task<User> AdminAsync()
    {
        var user = await CurrentUserAsync();
        if (user.Role != UserRole.Admin) throw ApiException.Forbidden("ADMIN_ONLY");
        return user;
    }

    protected string Message(string ka, string en) => Lang.Pick(ka, en);
}
