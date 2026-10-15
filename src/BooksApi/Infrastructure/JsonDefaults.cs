using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Unicode;

namespace BooksApi.Infrastructure;

public static class JsonDefaults
{
    /// <summary>camelCase properties, enums as camelCase strings ("trialing"), Georgian text unescaped.</summary>
    public static void Apply(JsonSerializerOptions o)
    {
        o.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        o.DictionaryKeyPolicy = null;
        o.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
        o.Encoder = JavaScriptEncoder.Create(UnicodeRanges.All);
        o.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
    }

    public static readonly JsonSerializerOptions Options = Create();

    private static JsonSerializerOptions Create()
    {
        var o = new JsonSerializerOptions();
        Apply(o);
        return o;
    }
}
