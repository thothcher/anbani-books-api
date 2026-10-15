using System.Security.Cryptography;
using System.Threading.RateLimiting;
using BooksApi.Data;
using BooksApi.Infrastructure;
using BooksApi.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// ── options ──────────────────────────────────────────────────────────────────
builder.Services.Configure<JwtOptions>(config.GetSection("Jwt"));
builder.Services.Configure<SandboxOptions>(config.GetSection("Sandbox"));
builder.Services.Configure<TeacherOptions>(config.GetSection("Teacher"));
builder.Services.Configure<StorageOptions>(config.GetSection("Storage"));
builder.Services.Configure<SmtpOptions>(config.GetSection("Smtp"));
builder.Services.Configure<HostingOptions>(config.GetSection("Hosting"));

// Without a configured JWT secret we create one and keep it next to the database,
// so tokens survive restarts and nobody ships a secret copied from GitHub.
builder.Services.AddOptions<JwtOptions>().PostConfigure<FileStorage>((o, storage) =>
{
    if (!string.IsNullOrWhiteSpace(o.Secret) && o.Secret.Length >= 32) return;
    var secretFile = Path.Combine(storage.Root, ".jwt-secret");
    if (!File.Exists(secretFile)) File.WriteAllText(secretFile, Convert.ToHexString(RandomNumberGenerator.GetBytes(48)));
    o.Secret = File.ReadAllText(secretFile).Trim();
});

// ── data & services ──────────────────────────────────────────────────────────
// SQLite file next to the uploads unless ConnectionStrings:Default says otherwise
builder.Services.AddDbContext<AppDbContext>((sp, o) =>
{
    var cs = sp.GetRequiredService<IConfiguration>().GetConnectionString("Default");
    o.UseSqlite(string.IsNullOrWhiteSpace(cs) ? $"Data Source={Path.Combine(sp.GetRequiredService<FileStorage>().Root, "books.db")}" : cs);
});
builder.Services.AddScoped<TenantContext>();
builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddSingleton<UsageTracker>();
builder.Services.AddHostedService<UsageFlushService>();
builder.Services.AddSingleton<FakePaymentGateway>();
builder.Services.AddSingleton<FileLinkSigner>();
builder.Services.AddSingleton<FileStorage>();
builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddScoped<TokenService>();
builder.Services.AddScoped<CodeService>();
builder.Services.AddScoped<Mailer>();
builder.Services.AddScoped<SubscriptionService>();
builder.Services.AddScoped<Urls>();
builder.Services.AddScoped<DtoMapper>();
builder.Services.AddScoped<Catalog>();
builder.Services.AddScoped<Seeder>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddMemoryCache();

builder.Services.AddControllers(o => o.SuppressImplicitRequiredAttributeForNonNullableReferenceTypes = true)
    .AddJsonOptions(o => JsonDefaults.Apply(o.JsonSerializerOptions))
    .ConfigureApiBehaviorOptions(o => o.InvalidModelStateResponseFactory = Problem.FromModelState);

builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
});

// ── authentication: JWT bearer tokens ────────────────────────────────────────
const string AuthFailureKey = "auth-failure";
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IOptions<JwtOptions>>((o, jwt) => o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidIssuer = jwt.Value.Issuer,
        ValidAudience = jwt.Value.Audience,
        IssuerSigningKey = TokenService.SigningKey(jwt.Value.Secret),
        NameClaimType = "sub",
        RoleClaimType = "role",
        ClockSkew = TimeSpan.FromSeconds(30),
    });
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false; // keep "sub", "role", "tid" as they are in the token
        o.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = ctx =>
            {
                ctx.HttpContext.Items[AuthFailureKey] = ctx.Exception is SecurityTokenExpiredException ? "TOKEN_EXPIRED" : "TOKEN_INVALID";
                return Task.CompletedTask;
            },
            OnTokenValidated = ctx =>
            {
                // a token only works with the API key (sandbox) it was issued for
                var tenant = ctx.HttpContext.RequestServices.GetRequiredService<TenantContext>();
                if (ctx.Principal?.FindFirst(TokenService.TenantClaim)?.Value != tenant.TenantId?.ToString())
                {
                    ctx.HttpContext.Items[AuthFailureKey] = "TOKEN_WRONG_SANDBOX";
                    ctx.Fail("Token from another sandbox");
                }
                return Task.CompletedTask;
            },
            OnChallenge = async ctx =>
            {
                ctx.HandleResponse();
                var code = ctx.HttpContext.Items[AuthFailureKey] as string ?? "AUTH_REQUIRED";
                ctx.Response.Headers.WWWAuthenticate = code == "TOKEN_EXPIRED" ? "Bearer error=\"invalid_token\", error_description=\"expired\"" : "Bearer";
                await Problem.WriteAsync(ctx.HttpContext, 401, code);
            },
            OnForbidden = ctx => Problem.WriteAsync(ctx.HttpContext, 403, "ADMIN_ONLY"),
        };
    });
builder.Services.AddAuthorization();

// ── rate limits (429 + Retry-After) ──────────────────────────────────────────
builder.Services.AddRateLimiter(o =>
{
    static SandboxOptions Limits(HttpContext http) => http.RequestServices.GetRequiredService<IOptions<SandboxOptions>>().Value;
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(http =>
        RateLimitPartition.GetTokenBucketLimiter(
            http.Request.Headers[ApiKeyMiddleware.Header].ToString() is { Length: > 0 } key ? key : http.Connection.RemoteIpAddress?.ToString() ?? "?",
            _ => new TokenBucketRateLimiterOptions
            {
                TokenLimit = Limits(http).RequestsPerMinute, TokensPerPeriod = Limits(http).RequestsPerMinute,
                ReplenishmentPeriod = TimeSpan.FromMinutes(1), AutoReplenishment = true, QueueLimit = 0,
            }));
    o.AddPolicy("auth", http => RateLimitPartition.GetFixedWindowLimiter(
        $"{http.Request.Headers[ApiKeyMiddleware.Header]}|{http.Connection.RemoteIpAddress}",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = Limits(http).AuthRequestsPerMinute, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    o.AddPolicy("keys", http => RateLimitPartition.GetFixedWindowLimiter(
        http.Connection.RemoteIpAddress?.ToString() ?? "?",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = Limits(http).KeysPerHour, Window = TimeSpan.FromHours(1), QueueLimit = 0 }));
    o.OnRejected = async (ctx, ct) =>
    {
        var retry = ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var after) ? (int)Math.Ceiling(after.TotalSeconds) : 60;
        ctx.HttpContext.Response.Headers.RetryAfter = retry.ToString();
        await Problem.WriteAsync(ctx.HttpContext, 429, "RATE_LIMITED", extensions: new Dictionary<string, object?> { ["retryAfter"] = retry });
    };
});

// ── CORS: students run their apps on localhost:5173, :3000, :4200… ──────────
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()
    .WithExposedHeaders("Content-Disposition", "Content-Range", "Accept-Ranges", "Content-Length", "Retry-After", "WWW-Authenticate")));

// ── OpenAPI document (/openapi/v1.json) + Swagger UI (/swagger) ──────────────
builder.Services.AddOpenApi("v1", o =>
{
    o.AddDocumentTransformer((document, _, _) =>
    {
        document.Info = new OpenApiInfo
        {
            Title = "BooksAPI — Anbani digital library",
            Version = "v1",
            Description = "სასწავლო API ციფრული ბიბლიოთეკისთვის: ავტორიზაცია, კატალოგი, გამოწერა უფასო საცდელი პერიოდით, PDF-ების კითხვა და ადმინ-პანელი. " +
                          "ყველა /api მოთხოვნას სჭირდება X-API-KEY ჰედერი. დოკუმენტაცია: /docs",
        };
        // groups in the order students meet them (Swagger UI follows this list)
        (string Name, string Description)[] tags =
        [
            ("Developer", "API გასაღები (X-API-KEY) — დაიწყეთ აქედან"),
            ("Auth", "რეგისტრაცია, ელ-ფოსტის დადასტურება, შესვლა, ტოკენები"),
            ("Users", "საკუთარი ანგარიში და პროფილი"),
            ("Categories", "ჟანრები"),
            ("Books", "კატალოგი, დეტალები, კითხვა; ადმინისთვის — მართვა"),
            ("Reviews", "შეფასებები"),
            ("Library", "რჩეულები, კითხვის პროგრესი, სტატისტიკა"),
            ("Plans", "გამოწერის გეგმები"),
            ("Subscription", "საცდელი პერიოდი, გადახდა, გაუქმება"),
            ("Payments", "გადახდების ისტორია"),
            ("Admin", "ადმინ-პანელი (role = admin)"),
            ("Sandbox", "სასწავლო ინსტრუმენტები: ინბოქსი, ბარათები, დროში მოგზაურობა"),
            ("Teacher", "ლექტორისთვის (X-Teacher-Secret)"),
        ];
        document.Tags = new HashSet<OpenApiTag>(tags.Select(t => new OpenApiTag { Name = t.Name, Description = t.Description }));
        document.Components ??= new OpenApiComponents();
        document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
        document.Components.SecuritySchemes["ApiKey"] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.ApiKey, In = ParameterLocation.Header, Name = ApiKeyMiddleware.Header,
            Description = "თქვენი sandbox-ის გასაღები. მიიღეთ დეველოპერის პორტალზე (/).",
        };
        document.Components.SecuritySchemes["Bearer"] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http, Scheme = "bearer", BearerFormat = "JWT",
            Description = "accessToken /api/auth/login-იდან (მოქმედებს 15 წუთი).",
        };
        return Task.CompletedTask;
    });
    o.AddOperationTransformer((operation, context, _) =>
    {
        var path = context.Description.RelativePath ?? "";
        var requirement = new OpenApiSecurityRequirement();
        if (!path.StartsWith("api/developer/keys") && !path.StartsWith("api/teacher"))
            requirement[new OpenApiSecuritySchemeReference("ApiKey", context.Document)] = [];
        if (context.Description.ActionDescriptor.EndpointMetadata.OfType<IAuthorizeData>().Any())
            requirement[new OpenApiSecuritySchemeReference("Bearer", context.Document)] = [];
        if (requirement.Count > 0)
        {
            operation.Security ??= [];
            operation.Security.Add(requirement);
        }
        return Task.CompletedTask;
    });
});

builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 64 * 1024 * 1024);

var app = builder.Build();

// ── database + seed ──────────────────────────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
    await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;");
    await scope.ServiceProvider.GetRequiredService<Seeder>().SeedAsync();
}

// ── pipeline ─────────────────────────────────────────────────────────────────
app.UseForwardedHeaders();
app.UseMiddleware<ErrorHandlingMiddleware>();
app.UseCors();

// 404 / 405 from routing get the same JSON error body as everything else
app.UseStatusCodePages(async ctx =>
{
    var http = ctx.HttpContext;
    if (!http.Request.Path.StartsWithSegments("/api") && !http.Request.Path.StartsWithSegments("/files")) return;
    if (http.Response.StatusCode is 404 or 405)
        await Problem.WriteAsync(http, http.Response.StatusCode, http.Response.StatusCode == 404 ? "NOT_FOUND" : "METHOD_NOT_ALLOWED");
});

// developer portal (wwwroot): "/" = portal, "/docs" = documentation, "/teacher" = teacher dashboard
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = c => c.Context.Response.Headers.CacheControl = "no-cache",
});

// documentation sources (docs/*.md, the Postman collection) under /content — rendered by /docs.html
var docsPath = app.Services.GetRequiredService<IOptions<HostingOptions>>().Value.DocsPath;
if (!string.IsNullOrWhiteSpace(docsPath))
{
    var full = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, docsPath));
    if (Directory.Exists(full))
    {
        var types = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
        types.Mappings[".md"] = "text/markdown; charset=utf-8";
        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = new PhysicalFileProvider(full), RequestPath = "/content", ContentTypeProvider = types,
            OnPrepareResponse = c => c.Context.Response.Headers.CacheControl = "no-cache",
        });
    }
}

// the reference website under /app (optional)
var webPath = app.Services.GetRequiredService<IOptions<HostingOptions>>().Value.WebAppPath;
if (!string.IsNullOrWhiteSpace(webPath))
{
    var full = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, webPath));
    if (Directory.Exists(full))
    {
        var files = new PhysicalFileProvider(full);
        app.MapGet("/app", () => Results.Redirect("/app/")).ExcludeFromDescription();
        app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files, RequestPath = "/app" });
        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = files, RequestPath = "/app",
            OnPrepareResponse = c => c.Context.Response.Headers.CacheControl = "no-cache",
        });
    }
}

app.UseRouting();
app.UseMiddleware<ApiKeyMiddleware>();
app.UseRateLimiter();
app.UseAuthentication();

// A request that sends a token must send a valid one — even to public endpoints.
// That way an expired token is reported (TOKEN_EXPIRED) instead of silently ignored.
// /api/auth/* is exempt so that "refresh" works even when the client still attaches the old token.
app.Use(async (http, next) =>
{
    if (http.Request.Path.StartsWithSegments("/api") && !http.Request.Path.StartsWithSegments("/api/auth")
        && http.Request.Headers.Authorization.Count > 0 && http.User.Identity?.IsAuthenticated != true)
    {
        await Problem.WriteAsync(http, 401, http.Items[AuthFailureKey] as string ?? "TOKEN_INVALID");
        return;
    }
    await next(http);
});
app.UseAuthorization();

app.MapControllers();
app.MapOpenApi("/openapi/{documentName}.json");
app.UseSwaggerUI(o =>
{
    o.SwaggerEndpoint("/openapi/v1.json", "BooksAPI v1");
    o.RoutePrefix = "swagger";
    o.DocumentTitle = "BooksAPI · Swagger";
    o.EnablePersistAuthorization();
    o.DisplayRequestDuration();
    o.EnableTryItOutByDefault();
});

app.MapGet("/health", async (AppDbContext db) =>
{
    var ok = await db.Database.CanConnectAsync();
    return Results.Json(new { status = ok ? "healthy" : "unhealthy", database = ok, version = "1.0", time = DateTime.UtcNow },
        statusCode: ok ? 200 : 503);
}).ExcludeFromDescription();

app.MapGet("/docs", () => Results.Redirect("/docs.html")).ExcludeFromDescription();
app.MapGet("/teacher", () => Results.Redirect("/teacher.html")).ExcludeFromDescription();

app.Run();

/// <summary>Exposed for the integration tests (WebApplicationFactory).</summary>
public partial class Program;
