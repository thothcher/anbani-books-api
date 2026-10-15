using System.Net.Mail;

namespace BooksApi.Infrastructure;

/// <summary>
/// Collects field errors and throws one 400 VALIDATION_ERROR with all of them:
/// <code>{ "errors": { "email": ["არასწორი ელ-ფოსტა."], "password": ["..."] } }</code>
/// Field names are the camelCase JSON names, so a frontend can show each message under its input.
/// </summary>
public sealed class Validator(Lang lang)
{
    private readonly Dictionary<string, List<string>> errors = [];

    public bool IsValid => errors.Count == 0;

    public Validator Add(string field, string ka, string en)
    {
        if (!errors.TryGetValue(field, out var list)) errors[field] = list = [];
        list.Add(lang == Lang.En ? en : ka);
        return this;
    }

    public Validator Must(bool condition, string field, string ka, string en) => condition ? this : Add(field, ka, en);

    public Validator Required(string field, string? value) =>
        string.IsNullOrWhiteSpace(value) ? Add(field, "ველი სავალდებულოა.", "This field is required.") : this;

    public Validator Required<T>(string field, T? value) where T : struct =>
        value is null ? Add(field, "ველი სავალდებულოა.", "This field is required.") : this;

    public Validator Length(string field, string? value, int min, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return this; // Required() reports missing values
        var len = value.Trim().Length;
        if (len < min) Add(field, $"მინიმუმ {min} სიმბოლო.", $"At least {min} characters.");
        else if (len > max) Add(field, $"მაქსიმუმ {max} სიმბოლო.", $"At most {max} characters.");
        return this;
    }

    public Validator MaxLength(string field, string? value, int max) =>
        value is not null && value.Length > max ? Add(field, $"მაქსიმუმ {max} სიმბოლო.", $"At most {max} characters.") : this;

    public Validator Range(string field, int? value, int min, int max) =>
        value is not null && (value < min || value > max)
            ? Add(field, $"მნიშვნელობა უნდა იყოს {min}-დან {max}-მდე.", $"Must be between {min} and {max}.")
            : this;

    public Validator Range(string field, double? value, double min, double max) =>
        value is not null && (value < min || value > max)
            ? Add(field, $"მნიშვნელობა უნდა იყოს {min}-დან {max}-მდე.", $"Must be between {min} and {max}.")
            : this;

    public Validator Email(string field, string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return this;
        var ok = value.Length <= 120 && value.Contains('@') && MailAddress.TryCreate(value.Trim(), out var a) && a.Address == value.Trim()
                 && a.Host.Contains('.') && !a.Host.EndsWith('.');
        return ok ? this : Add(field, "ელ-ფოსტის ფორმატი არასწორია.", "This is not a valid email address.");
    }

    /// <summary>At least 8 characters, one letter and one digit.</summary>
    public Validator Password(string field, string? value)
    {
        if (string.IsNullOrEmpty(value)) return this;
        if (value.Length < 8 || value.Length > 64 || !value.Any(char.IsLetter) || !value.Any(char.IsDigit))
            Add(field, "პაროლი უნდა შედგებოდეს მინიმუმ 8 სიმბოლოსგან და შეიცავდეს ასოს და ციფრს.",
                "The password must be at least 8 characters long and contain a letter and a digit.");
        return this;
    }

    public Validator OneOf(string field, string? value, params string[] allowed)
    {
        if (value is null) return this;
        return allowed.Contains(value, StringComparer.OrdinalIgnoreCase)
            ? this
            : Add(field, $"დასაშვები მნიშვნელობები: {string.Join(", ", allowed)}.", $"Allowed values: {string.Join(", ", allowed)}.");
    }

    public void ThrowIfInvalid()
    {
        if (errors.Count > 0)
            throw new ApiException(400, "VALIDATION_ERROR", errors: errors.ToDictionary(e => e.Key, e => e.Value.ToArray()));
    }
}
