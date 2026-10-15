using BooksApi.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace BooksApi.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options, TenantContext tenant) : DbContext(options)
{
    /// <summary>The sandbox of the current request (-1 when there is none: then tenant data matches nothing).</summary>
    public int CurrentTenantId => tenant.TenantId ?? -1;

    public DbSet<ApiKey> ApiKeys => Set<ApiKey>();
    public DbSet<ApiKeyEndpointStat> ApiKeyEndpointStats => Set<ApiKeyEndpointStat>();
    public DbSet<User> Users => Set<User>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<VerificationCode> VerificationCodes => Set<VerificationCode>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Book> Books => Set<Book>();
    public DbSet<Review> Reviews => Set<Review>();
    public DbSet<Favorite> Favorites => Set<Favorite>();
    public DbSet<ReadingProgress> ReadingProgress => Set<ReadingProgress>();
    public DbSet<ReadingLog> ReadingLogs => Set<ReadingLog>();
    public DbSet<Plan> Plans => Set<Plan>();
    public DbSet<Subscription> Subscriptions => Set<Subscription>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<EmailMessage> Emails => Set<EmailMessage>();

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
        // Dependents (reviews, favorites…) carry the same tenant filter as their parents, so this warning is noise.
        optionsBuilder.ConfigureWarnings(w => w.Ignore(CoreEventId.PossibleIncorrectRequiredNavigationWithQueryFilterInteractionWarning));
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder builder)
    {
        // SQLite has no DateTime type: values come back with Kind=Unspecified, which would serialize
        // without the trailing "Z" and make browsers treat UTC as local time. Force UTC everywhere.
        builder.Properties<DateTime>().HaveConversion<UtcConverter>();
        builder.Properties<DateTime?>().HaveConversion<NullableUtcConverter>();
        builder.Properties<UserRole>().HaveConversion<string>();
        builder.Properties<SubscriptionStatus>().HaveConversion<string>();
        builder.Properties<PaymentStatus>().HaveConversion<string>();
        builder.Properties<PaymentKind>().HaveConversion<string>();
        builder.Properties<CodePurpose>().HaveConversion<string>();
        builder.Properties<ReadingStatus>().HaveConversion<string>();
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<ApiKey>(e =>
        {
            e.HasIndex(x => x.Key).IsUnique();
            e.Property(x => x.Key).HasMaxLength(64);
        });
        b.Entity<ApiKeyEndpointStat>().HasIndex(x => new { x.ApiKeyId, x.Endpoint }).IsUnique();

        b.Entity<User>(e =>
        {
            e.HasIndex(x => new { x.TenantId, x.NormalizedEmail }).IsUnique();
            e.HasIndex(x => x.AvatarKey);
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
            e.HasOne(x => x.Subscription).WithOne(x => x.User).HasForeignKey<Subscription>(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });
        b.Entity<RefreshToken>(e =>
        {
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasOne(x => x.User).WithMany().OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.User.TenantId == CurrentTenantId);
        });
        b.Entity<VerificationCode>(e =>
        {
            e.HasIndex(x => new { x.UserId, x.Purpose });
            e.HasOne(x => x.User).WithMany().OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.User.TenantId == CurrentTenantId);
        });

        b.Entity<Category>(e =>
        {
            e.HasIndex(x => new { x.TenantId, x.Slug }).IsUnique();
            e.HasQueryFilter(x => x.TenantId == null || x.TenantId == CurrentTenantId);
        });
        b.Entity<Book>(e =>
        {
            e.HasIndex(x => x.Slug);
            e.HasIndex(x => x.CoverKey).IsUnique();
            e.HasIndex(x => x.PreviewKey).IsUnique();
            e.HasIndex(x => x.TenantId);
            e.HasOne(x => x.Category).WithMany(x => x.Books).OnDelete(DeleteBehavior.Restrict);
            e.HasQueryFilter(x => x.TenantId == null || x.TenantId == CurrentTenantId);
        });

        b.Entity<Review>(e =>
        {
            e.HasIndex(x => new { x.TenantId, x.BookId, x.UserId }).IsUnique();
            e.HasOne(x => x.Book).WithMany().OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.User).WithMany().OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });
        b.Entity<Favorite>(e =>
        {
            e.HasKey(x => new { x.UserId, x.BookId });
            e.HasOne(x => x.Book).WithMany().OnDelete(DeleteBehavior.Cascade);
            e.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });
        b.Entity<ReadingProgress>(e =>
        {
            e.HasKey(x => new { x.UserId, x.BookId });
            e.HasOne(x => x.Book).WithMany().OnDelete(DeleteBehavior.Cascade);
            e.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });
        b.Entity<ReadingLog>(e =>
        {
            e.HasKey(x => new { x.UserId, x.Day });
            e.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });

        b.Entity<Plan>().HasIndex(x => x.Code).IsUnique();
        b.Entity<Subscription>(e =>
        {
            e.HasIndex(x => x.UserId).IsUnique();
            e.HasOne(x => x.Plan).WithMany().OnDelete(DeleteBehavior.Restrict);
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });
        b.Entity<Payment>(e =>
        {
            e.HasIndex(x => new { x.TenantId, x.CreatedAt });
            e.HasIndex(x => x.InvoiceNumber).IsUnique();
            e.HasOne(x => x.User).WithMany().OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Plan).WithMany().OnDelete(DeleteBehavior.SetNull);
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });
        b.Entity<EmailMessage>(e =>
        {
            e.HasIndex(x => new { x.TenantId, x.ToEmail });
            e.HasQueryFilter(x => x.TenantId == CurrentTenantId);
        });
    }

    private sealed class UtcConverter() : ValueConverter<DateTime, DateTime>(
        v => v.Kind == DateTimeKind.Utc ? v : v.ToUniversalTime(),
        v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

    private sealed class NullableUtcConverter() : ValueConverter<DateTime?, DateTime?>(
        v => v == null ? v : v.Value.Kind == DateTimeKind.Utc ? v : v.Value.ToUniversalTime(),
        v => v == null ? v : DateTime.SpecifyKind(v.Value, DateTimeKind.Utc));
}

/// <summary>Lets `dotnet ef migrations add` create the context without running the web host.</summary>
public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite("Data Source=books.db").Options;
        return new AppDbContext(options, new TenantContext());
    }
}
