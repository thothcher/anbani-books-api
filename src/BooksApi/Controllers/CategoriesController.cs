using System.Text.RegularExpressions;
using BooksApi.Contracts;
using BooksApi.Data;
using BooksApi.Infrastructure;
using BooksApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BooksApi.Controllers;

/// <summary>Genres. Everyone can read them; admins can add their own (built-in ones are read-only).</summary>
[Route("api/categories")]
[Tags("Categories")]
public sealed partial class CategoriesController(DtoMapper map, IClock clock) : ApiControllerBase
{
    /// <summary>კატეგორიების სია (წიგნების რაოდენობით).</summary>
    [HttpGet]
    public async Task<List<CategoryDto>> List()
    {
        var user = await OptionalUserAsync();
        var isAdmin = user?.Role == UserRole.Admin;
        var counts = await Db.Books.Where(b => b.IsPublished || isAdmin)
            .GroupBy(b => b.CategoryId).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count);
        var categories = await Db.Categories.OrderBy(c => c.SortOrder).ThenBy(c => c.Id).ToListAsync();
        return categories.Select(c => map.Category(c, counts.GetValueOrDefault(c.Id), isAdmin)).ToList();
    }

    /// <summary>ერთი კატეგორია.</summary>
    [HttpGet("{id:int}")]
    public async Task<CategoryDto> Get(int id)
    {
        var user = await OptionalUserAsync();
        var isAdmin = user?.Role == UserRole.Admin;
        var c = await Db.Categories.FirstOrDefaultAsync(x => x.Id == id) ?? throw ApiException.NotFound("CATEGORY_NOT_FOUND");
        var count = await Db.Books.CountAsync(b => b.CategoryId == id && (b.IsPublished || isAdmin));
        return map.Category(c, count, isAdmin);
    }

    /// <summary>კატეგორიის შექმნა (Admin).</summary>
    [HttpPost]
    [Authorize]
    [ProducesResponseType<CategoryDto>(StatusCodes.Status201Created)]
    public async Task<IActionResult> Create(CategoryRequest req)
    {
        await AdminAsync();
        Validate(req);
        var name = req.Name!.Trim();
        if (await Db.Categories.AnyAsync(c => c.Name == name || c.NameEn == name)) throw ApiException.Conflict("CATEGORY_EXISTS");

        var now = clock.UtcNow;
        var category = new Category
        {
            TenantId = Tenant.Require(),
            Name = name,
            NameEn = string.IsNullOrWhiteSpace(req.NameEn) ? null : req.NameEn.Trim(),
            Slug = await UniqueSlugAsync(req.NameEn ?? name),
            SortOrder = 100,
            CreatedAt = now,
            UpdatedAt = now,
        };
        Db.Categories.Add(category);
        await Db.SaveChangesAsync();
        return StatusCode(201, map.Category(category, 0, true));
    }

    /// <summary>კატეგორიის რედაქტირება (Admin, მხოლოდ საკუთარი).</summary>
    [HttpPut("{id:int}")]
    [Authorize]
    public async Task<CategoryDto> Update(int id, CategoryRequest req)
    {
        await AdminAsync();
        Validate(req);
        var category = await Db.Categories.FirstOrDefaultAsync(c => c.Id == id) ?? throw ApiException.NotFound("CATEGORY_NOT_FOUND");
        if (category.TenantId is null) throw ApiException.Forbidden("SYSTEM_RESOURCE");
        var name = req.Name!.Trim();
        if (await Db.Categories.AnyAsync(c => c.Id != id && (c.Name == name || c.NameEn == name))) throw ApiException.Conflict("CATEGORY_EXISTS");

        category.Name = name;
        category.NameEn = string.IsNullOrWhiteSpace(req.NameEn) ? null : req.NameEn.Trim();
        category.UpdatedAt = clock.UtcNow;
        await Db.SaveChangesAsync();
        return map.Category(category, await Db.Books.CountAsync(b => b.CategoryId == id), true);
    }

    /// <summary>კატეგორიის წაშლა (Admin). ცარიელი უნდა იყოს.</summary>
    [HttpDelete("{id:int}")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(int id)
    {
        await AdminAsync();
        var category = await Db.Categories.FirstOrDefaultAsync(c => c.Id == id) ?? throw ApiException.NotFound("CATEGORY_NOT_FOUND");
        if (category.TenantId is null) throw ApiException.Forbidden("SYSTEM_RESOURCE");
        if (await Db.Books.AnyAsync(b => b.CategoryId == id)) throw ApiException.Conflict("CATEGORY_NOT_EMPTY");
        Db.Categories.Remove(category);
        await Db.SaveChangesAsync();
        return NoContent();
    }

    private void Validate(CategoryRequest req) =>
        NewValidator().Required("name", req.Name).Length("name", req.Name, 2, 40).Length("nameEn", req.NameEn, 2, 40).ThrowIfInvalid();

    private async Task<string> UniqueSlugAsync(string source)
    {
        var slug = SlugChars().Replace(source.Trim().ToLowerInvariant(), "-").Trim('-');
        if (slug.Length < 2) slug = "category";
        var candidate = slug;
        for (var i = 2; await Db.Categories.AnyAsync(c => c.Slug == candidate); i++) candidate = $"{slug}-{i}";
        return candidate;
    }

    [GeneratedRegex(@"[^\p{L}\p{N}]+")]
    private static partial Regex SlugChars();
}
