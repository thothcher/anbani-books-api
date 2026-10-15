using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace BooksApi.Infrastructure;

/// <summary>Writes every error in the same RFC 7807 "problem details" shape (plus a stable <c>code</c>).</summary>
public static class Problem
{
    public static Task WriteAsync(HttpContext http, int status, string code, string? detail = null,
        IDictionary<string, string[]>? errors = null, IDictionary<string, object?>? extensions = null)
    {
        var body = Build(http, status, code, detail, errors, extensions);
        http.Response.StatusCode = status;
        http.Response.ContentType = "application/problem+json; charset=utf-8";
        return http.Response.WriteAsync(JsonSerializer.Serialize(body, JsonDefaults.Options));
    }

    public static Dictionary<string, object?> Build(HttpContext http, int status, string code, string? detail = null,
        IDictionary<string, string[]>? errors = null, IDictionary<string, object?>? extensions = null)
    {
        var lang = http.GetLang();
        var (title, message) = ErrorCatalog.Get(code, lang);
        var body = new Dictionary<string, object?>
        {
            ["type"] = $"{http.Request.Scheme}://{http.Request.Host}/docs#{code}",
            ["title"] = title,
            ["status"] = status,
            ["code"] = code,
            ["detail"] = detail ?? message,
        };
        if (errors is { Count: > 0 }) body["errors"] = errors;
        if (extensions != null) foreach (var (k, v) in extensions) body[k] = v;
        body["traceId"] = http.TraceIdentifier;
        return body;
    }

    /// <summary>Used by [ApiController] when the JSON body can't be read (wrong types, broken JSON).</summary>
    public static IActionResult FromModelState(ActionContext context)
    {
        var errors = context.ModelState
            .Where(e => e.Value?.Errors.Count > 0)
            .ToDictionary(
                e => string.IsNullOrEmpty(e.Key) ? "body" : JsonNamingPolicy.CamelCase.ConvertName(e.Key.TrimStart('$', '.')),
                e => e.Value!.Errors.Select(x => context.HttpContext.GetLang() == Lang.En
                    ? (string.IsNullOrEmpty(x.ErrorMessage) ? "Invalid value." : x.ErrorMessage)
                    : "მნიშვნელობა არასწორი ფორმატისაა.").ToArray());
        var body = Build(context.HttpContext, 400, "INVALID_JSON", errors: errors);
        return new ObjectResult(body) { StatusCode = 400, ContentTypes = { "application/problem+json" } };
    }
}

/// <summary>Turns exceptions into problem responses. Unknown exceptions become a 500 without leaking internals.</summary>
public sealed class ErrorHandlingMiddleware(RequestDelegate next, ILogger<ErrorHandlingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext http)
    {
        try
        {
            await next(http);
        }
        catch (ApiException ex) when (!http.Response.HasStarted)
        {
            await Problem.WriteAsync(http, ex.Status, ex.Code, ex.Detail, ex.Errors, ex.Extensions);
        }
        catch (BadHttpRequestException ex) when (!http.Response.HasStarted)
        {
            await Problem.WriteAsync(http, ex.StatusCode, ex.StatusCode == 413 ? "FILE_TOO_LARGE" : "INVALID_JSON", ex.Message);
        }
        catch (OperationCanceledException) when (http.RequestAborted.IsCancellationRequested)
        {
            // client went away — nothing to send
        }
        catch (Exception ex) when (!http.Response.HasStarted)
        {
            logger.LogError(ex, "Unhandled error on {Method} {Path}", http.Request.Method, http.Request.Path);
            await Problem.WriteAsync(http, 500, "INTERNAL_ERROR");
        }
    }
}
