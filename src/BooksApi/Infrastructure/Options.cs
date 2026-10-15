namespace BooksApi.Infrastructure;

public sealed class JwtOptions
{
    public string Issuer { get; set; } = "BooksApi";
    public string Audience { get; set; } = "BooksApi.Clients";
    /// <summary>HMAC-SHA256 signing key — at least 32 characters. Change it in production!</summary>
    public string Secret { get; set; } = "";
    public int AccessTokenMinutes { get; set; } = 15;
    public int RefreshTokenDays { get; set; } = 30;
}

public sealed class SandboxOptions
{
    /// <summary>Students can create their own API key on the developer portal.</summary>
    public bool AllowSelfServiceKeys { get; set; } = true;
    /// <summary>API key of the reference website. Seeded with demo users, reviews and payments.</summary>
    public string DemoApiKey { get; set; } = "anbani-demo-key";
    public bool SeedDemoData { get; set; } = true;
    /// <summary>GET /api/sandbox/inbox — lets students read the e-mails the API sent.</summary>
    public bool EnableInbox { get; set; } = true;
    public int StorageQuotaMb { get; set; } = 200;
    public int MaxPdfMb { get; set; } = 30;
    public int MaxImageMb { get; set; } = 3;
    /// <summary>How long a signed "read" / "download" link stays valid.</summary>
    public int FileLinkMinutes { get; set; } = 120;
    public int RequestsPerMinute { get; set; } = 300;
    /// <summary>Login, register, verify… per API key and IP.</summary>
    public int AuthRequestsPerMinute { get; set; } = 30;
    /// <summary>Self-service API keys per IP per hour.</summary>
    public int KeysPerHour { get; set; } = 10;
}

public sealed class TeacherOptions
{
    /// <summary>Secret for /api/teacher/* (header X-Teacher-Secret). Empty = teacher endpoints are off.</summary>
    public string Secret { get; set; } = "";
}

public sealed class StorageOptions
{
    /// <summary>Uploaded PDFs, covers and avatars. Relative paths are resolved against the content root.</summary>
    public string Root { get; set; } = "storage";
}

public sealed class SmtpOptions
{
    /// <summary>Optional. When Host is empty, e-mails only go to the sandbox inbox.</summary>
    public string? Host { get; set; }
    public int Port { get; set; } = 587;
    public string? User { get; set; }
    public string? Password { get; set; }
    public string From { get; set; } = "Anbani <no-reply@anbani.ge>";
    public bool EnableSsl { get; set; } = true;
}

public sealed class HostingOptions
{
    /// <summary>Absolute base URL used in links (cover/preview/file URLs). Empty = taken from the request.</summary>
    public string? PublicBaseUrl { get; set; }
    /// <summary>Folder of the reference website, served under /app. Empty = not served.</summary>
    public string? WebAppPath { get; set; }
    /// <summary>Folder with the Markdown documentation and the Postman collection, served under /content.</summary>
    public string? DocsPath { get; set; }
}
