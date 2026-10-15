using BooksApi.Infrastructure;

namespace BooksApi.Services;

public sealed record CardInput(string? Number, string? HolderName, int? ExpMonth, int? ExpYear, string? Cvc);

/// <summary>What we keep about a card: never the full number or the CVC.</summary>
public sealed record SavedCard(string Brand, string Last4, int ExpMonth, int ExpYear, string Holder, string Behavior);

public sealed record TestCard(string Number, string Brand, string Behavior, string DescriptionKa, string DescriptionEn);

/// <summary>
/// A pretend payment processor, like Stripe's test mode. Only the test cards below are accepted —
/// real card numbers are rejected on purpose, so nobody types their own card into a student project.
/// </summary>
public sealed class FakePaymentGateway
{
    public static readonly IReadOnlyList<TestCard> TestCards =
    [
        new("4242424242424242", "visa", "success", "წარმატებული გადახდა", "Payment succeeds"),
        new("5555555555554444", "mastercard", "success", "წარმატებული გადახდა (Mastercard)", "Payment succeeds (Mastercard)"),
        new("4000000000000002", "visa", "declined", "ბანკი უარყოფს — CARD_DECLINED", "Declined by the bank — CARD_DECLINED"),
        new("4000000000009995", "visa", "insufficient_funds", "არასაკმარისი თანხა — INSUFFICIENT_FUNDS", "Insufficient funds — INSUFFICIENT_FUNDS"),
        new("4000000000000069", "visa", "expired_card", "ვადაგასული ბარათი — EXPIRED_CARD", "Expired card — EXPIRED_CARD"),
        new("4000000000000127", "visa", "incorrect_cvc", "არასწორი CVC — INCORRECT_CVC", "Wrong CVC — INCORRECT_CVC"),
        new("4000000000000119", "visa", "processing_error", "დამუშავების შეცდომა — PROCESSING_ERROR", "Processing error — PROCESSING_ERROR"),
        new("4000000000000341", "visa", "fail_on_renewal", "ახლა გადაიხდის, მაგრამ ავტომატური განახლებისას უარყოფს", "Pays now, but is declined on the automatic renewal"),
    ];

    /// <summary>Format checks (400 with field errors). Returns null when invalid; throws 402 for non-test cards.</summary>
    public SavedCard? Validate(CardInput? card, DateTime now, Validator v, string prefix = "card")
    {
        if (card is null)
        {
            v.Add(prefix, "ბარათის მონაცემები სავალდებულოა.", "Card details are required.");
            return null;
        }
        var number = new string((card.Number ?? "").Where(char.IsDigit).ToArray());
        var brand = Brand(number);

        if (string.IsNullOrWhiteSpace(card.Number)) v.Required($"{prefix}.number", card.Number);
        else if (number.Length is < 13 or > 19 || !Luhn(number) || (card.Number ?? "").Any(c => !char.IsDigit(c) && c != ' ' && c != '-'))
            v.Add($"{prefix}.number", "ბარათის ნომერი არასწორია.", "The card number is invalid.");

        v.Required($"{prefix}.holderName", card.HolderName).Length($"{prefix}.holderName", card.HolderName, 2, 60);

        var year = card.ExpYear is >= 0 and < 100 ? 2000 + card.ExpYear : card.ExpYear;
        v.Required($"{prefix}.expMonth", card.ExpMonth).Range($"{prefix}.expMonth", card.ExpMonth, 1, 12);
        v.Required($"{prefix}.expYear", year).Range($"{prefix}.expYear", year, 2000, 2100);
        if (card.ExpMonth is >= 1 and <= 12 && year is >= 2000 and <= 2100 && EndOfMonth(year.Value, card.ExpMonth.Value) < now)
            v.Add($"{prefix}.expYear", "ბარათის ვადა წარსულშია.", "The card's expiry date is in the past.");

        var cvcLength = brand == "amex" ? 4 : 3;
        if (string.IsNullOrWhiteSpace(card.Cvc)) v.Required($"{prefix}.cvc", card.Cvc);
        else if (card.Cvc.Length != cvcLength || !card.Cvc.All(char.IsDigit))
            v.Add($"{prefix}.cvc", $"CVC უნდა იყოს {cvcLength} ციფრი.", $"The CVC must be {cvcLength} digits.");

        if (!v.IsValid) return null;

        var test = TestCards.FirstOrDefault(t => t.Number == number)
                   ?? throw new ApiException(402, "TEST_CARD_REQUIRED");
        return new SavedCard(test.Brand, number[^4..], card.ExpMonth!.Value, year!.Value, card.HolderName!.Trim(), test.Behavior);
    }

    /// <summary>Charges a card. <paramref name="offSession"/> = automatic renewal or plan change with the saved card.</summary>
    public string? Charge(SavedCard card, int amountMinor, DateTime at, bool offSession)
    {
        if (EndOfMonth(card.ExpYear, card.ExpMonth) < at) return "EXPIRED_CARD";
        return card.Behavior switch
        {
            "success" => null,
            "fail_on_renewal" => offSession ? "CARD_DECLINED" : null,
            "declined" => "CARD_DECLINED",
            "insufficient_funds" => "INSUFFICIENT_FUNDS",
            "expired_card" => "EXPIRED_CARD",
            "incorrect_cvc" => "INCORRECT_CVC",
            "processing_error" => "PROCESSING_ERROR",
            _ => "CARD_DECLINED",
        };
    }

    public static string Brand(string number) => number switch
    {
        _ when number.StartsWith('4') => "visa",
        _ when number.Length >= 2 && number[..2] is "51" or "52" or "53" or "54" or "55" => "mastercard",
        _ when number.Length >= 4 && int.TryParse(number[..4], out var p) && p is >= 2221 and <= 2720 => "mastercard",
        _ when number.StartsWith("34") || number.StartsWith("37") => "amex",
        _ => "card",
    };

    private static bool Luhn(string digits)
    {
        var sum = 0;
        var alt = false;
        for (var i = digits.Length - 1; i >= 0; i--)
        {
            var n = digits[i] - '0';
            if (alt) { n *= 2; if (n > 9) n -= 9; }
            sum += n;
            alt = !alt;
        }
        return sum % 10 == 0;
    }

    private static DateTime EndOfMonth(int year, int month) =>
        new DateTime(year, month, DateTime.DaysInMonth(year, month), 23, 59, 59, DateTimeKind.Utc);
}
