using BooksApi.Infrastructure;
using Microsoft.Extensions.Options;

namespace BooksApi.Services;

/// <summary>
/// Files live in two places:
///   • "seed:books/dracula.pdf" — the built-in library shipped in SeedData/ (read-only)
///   • "t12/books/ab12….pdf"    — uploads, under Storage:Root, one folder per sandbox (t{tenantId})
/// </summary>
public sealed class FileStorage(IWebHostEnvironment env, IOptions<StorageOptions> options)
{
    public string SeedRoot => Path.Combine(env.ContentRootPath, "SeedData");

    public string Root
    {
        get
        {
            var root = options.Value.Root;
            var full = Path.IsPathRooted(root) ? root : Path.Combine(env.ContentRootPath, root);
            Directory.CreateDirectory(full);
            return full;
        }
    }

    public string Resolve(string stored) =>
        stored.StartsWith("seed:", StringComparison.Ordinal)
            ? Path.Combine(SeedRoot, stored[5..])
            : Path.Combine(Root, stored);

    public bool Exists(string? stored) => stored is not null && File.Exists(Resolve(stored));

    public async Task<string> SaveAsync(int tenantId, string folder, Stream content, string extension, CancellationToken ct = default)
    {
        var relative = Path.Combine($"t{tenantId}", folder, $"{Guid.NewGuid():N}{extension}");
        var full = Path.Combine(Root, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        await using var file = File.Create(full);
        await content.CopyToAsync(file, ct);
        return relative.Replace('\\', '/');
    }

    /// <summary>Path for a file we are about to create ourselves (e.g. a generated preview).</summary>
    public string NewPath(int tenantId, string folder, string extension)
    {
        var relative = $"t{tenantId}/{folder}/{Guid.NewGuid():N}{extension}";
        Directory.CreateDirectory(Path.GetDirectoryName(Path.Combine(Root, relative))!);
        return relative;
    }

    public void Delete(string? stored)
    {
        if (stored is null || stored.StartsWith("seed:", StringComparison.Ordinal)) return;
        try { File.Delete(Path.Combine(Root, stored)); } catch (IOException) { /* best effort */ }
    }

    public long TenantUsage(int tenantId)
    {
        var dir = Path.Combine(Root, $"t{tenantId}");
        return Directory.Exists(dir) ? new DirectoryInfo(dir).EnumerateFiles("*", SearchOption.AllDirectories).Sum(f => f.Length) : 0;
    }

    public void DeleteTenant(int tenantId)
    {
        var dir = Path.Combine(Root, $"t{tenantId}");
        if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);
    }
}
