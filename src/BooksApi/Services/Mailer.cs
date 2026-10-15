using System.Globalization;
using System.Net;
using System.Net.Mail;
using BooksApi.Data;
using BooksApi.Infrastructure;
using Microsoft.Extensions.Options;

namespace BooksApi.Services;

public sealed record MailContent(string Type, string Subject, string Text, string Html, string? Code = null);

/// <summary>
/// "Sends" e-mails: every message is stored in the sandbox inbox (GET /api/sandbox/inbox),
/// and — only if SMTP is configured — also delivered for real.
/// </summary>
public sealed class Mailer(AppDbContext db, IClock clock, IOptions<SmtpOptions> smtp, ILogger<Mailer> logger)
{
    public async Task SendAsync(int tenantId, string to, MailContent mail)
    {
        db.Emails.Add(new EmailMessage
        {
            TenantId = tenantId,
            ToEmail = to.Trim().ToLowerInvariant(),
            Subject = mail.Subject,
            BodyText = mail.Text,
            BodyHtml = mail.Html,
            Type = mail.Type,
            Code = mail.Code,
            CreatedAt = clock.UtcNow,
        });
        await db.SaveChangesAsync();

        var o = smtp.Value;
        if (string.IsNullOrWhiteSpace(o.Host)) return;
        try
        {
            using var client = new SmtpClient(o.Host, o.Port) { EnableSsl = o.EnableSsl, Timeout = 10000 };
            if (!string.IsNullOrEmpty(o.User)) client.Credentials = new NetworkCredential(o.User, o.Password);
            using var message = new MailMessage(o.From, to, mail.Subject, mail.Html) { IsBodyHtml = true };
            await client.SendMailAsync(message);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "SMTP delivery to {To} failed (the message is still in the sandbox inbox)", to);
        }
    }
}

/// <summary>All e-mail texts, in Georgian and English.</summary>
public static class MailTemplates
{
    public static string Money(int minor, string currency, Lang lang) =>
        lang == Lang.En
            ? $"{minor / 100m:0.00} {currency}"
            : $"{(minor / 100m).ToString("0.00", CultureInfo.InvariantCulture)} ₾";

    public static string Date(DateTime d, Lang lang) =>
        lang == Lang.En ? d.ToString("MMM d, yyyy", CultureInfo.InvariantCulture) : d.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture);

    public static MailContent VerifyEmail(Lang lang, string name, string code) => lang == Lang.En
        ? Build("verify_email", $"Confirm your email — code {code}", $"Hi {name},",
            ["Here is your code to confirm your email address on Anbani:"], code, ["The code is valid for 15 minutes. If you didn't create an account, ignore this message."])
        : Build("verify_email", $"დაადასტურეთ ელ-ფოსტა — კოდი {code}", $"გამარჯობა, {name}!",
            ["ანბანზე ელ-ფოსტის დასადასტურებლად გამოიყენეთ ეს კოდი:"], code, ["კოდი მოქმედებს 15 წუთის განმავლობაში. თუ ანგარიში თქვენ არ შეგიქმნიათ, უბრალოდ უგულებელყავით ეს წერილი."]);

    public static MailContent PasswordReset(Lang lang, string name, string code) => lang == Lang.En
        ? Build("password_reset", $"Your password reset code: {code}", $"Hi {name},",
            ["Someone (hopefully you) asked to reset the password of your Anbani account. Use this code:"], code, ["The code is valid for 15 minutes. If it wasn't you, your password stays the same."])
        : Build("password_reset", $"პაროლის აღდგენის კოდი: {code}", $"გამარჯობა, {name}!",
            ["თქვენი ანბანის ანგარიშის პაროლის აღდგენა მოითხოვეს. გამოიყენეთ ეს კოდი:"], code, ["კოდი მოქმედებს 15 წუთის განმავლობაში. თუ ეს თქვენ არ ყოფილხართ, პაროლი უცვლელი რჩება."]);

    public static MailContent Welcome(Lang lang, string name) => lang == Lang.En
        ? Build("welcome", "Welcome to Anbani 📚", $"Welcome, {name}!",
            ["Your email is confirmed. You can now start a free 7-day trial and read every book in the library — classics, Georgian literature and more."], null, ["Happy reading!"])
        : Build("welcome", "კეთილი იყოს თქვენი მობრძანება ანბანში 📚", $"მოგესალმებით, {name}!",
            ["თქვენი ელ-ფოსტა დადასტურებულია. ახლა შეგიძლიათ დაიწყოთ 7-დღიანი უფასო საცდელი პერიოდი და წაიკითხოთ ბიბლიოთეკის ყველა წიგნი — მსოფლიო კლასიკა, ქართული ლიტერატურა და სხვა."], null, ["სასიამოვნო კითხვას გისურვებთ!"]);

    public static MailContent TrialStarted(Lang lang, string name, string plan, DateTime endsAt) => lang == Lang.En
        ? Build("trial_started", "Your free trial has started", $"Hi {name},",
            [$"Your free trial of the {plan} plan is active until {Date(endsAt, lang)}. Read as much as you like!",
             "No card was charged. To keep reading after the trial, subscribe or add a card before it ends."], null, [])
        : Build("trial_started", "თქვენი უფასო საცდელი პერიოდი დაიწყო", $"გამარჯობა, {name}!",
            [$"„{plan}“ გეგმის უფასო საცდელი პერიოდი მოქმედებს {Date(endsAt, lang)}-მდე. იკითხეთ რამდენიც გინდათ!",
             "ბარათიდან თანხა არ ჩამოგეჭრათ. საცდელი პერიოდის შემდეგაც რომ განაგრძოთ კითხვა, გამოიწერეთ ან დაამატეთ ბარათი მის დასრულებამდე."], null, []);

    public static MailContent Receipt(Lang lang, string name, Payment p, string plan) => lang == Lang.En
        ? Build("receipt", $"Payment receipt {p.InvoiceNumber}", $"Thank you, {name}!",
            [$"We received {Money(p.AmountMinor, p.Currency, lang)} for the {plan} plan.",
             $"Invoice: {p.InvoiceNumber} · Card: {p.CardBrand?.ToUpperInvariant()} •••• {p.CardLast4}",
             p.PeriodStart is { } s && p.PeriodEnd is { } e ? $"Period: {Date(s, lang)} – {Date(e, lang)}" : ""], null, ["This is a sandbox receipt — no real money was moved."])
        : Build("receipt", $"გადახდის ქვითარი {p.InvoiceNumber}", $"გმადლობთ, {name}!",
            [$"„{plan}“ გეგმისთვის მივიღეთ {Money(p.AmountMinor, p.Currency, lang)}.",
             $"ინვოისი: {p.InvoiceNumber} · ბარათი: {p.CardBrand?.ToUpperInvariant()} •••• {p.CardLast4}",
             p.PeriodStart is { } s2 && p.PeriodEnd is { } e2 ? $"პერიოდი: {Date(s2, lang)} – {Date(e2, lang)}" : ""], null, ["ეს სატესტო ქვითარია — ნამდვილი თანხა არ ჩამოჭრილა."]);

    public static MailContent PaymentFailed(Lang lang, string name, string reason) => lang == Lang.En
        ? Build("payment_failed", "We couldn't charge your card", $"Hi {name},",
            [$"Your subscription payment failed: {reason}", "Your access has ended. You can subscribe again with another card at any time."], null, [])
        : Build("payment_failed", "გადახდა ვერ შესრულდა", $"გამარჯობა, {name}!",
            [$"გამოწერის გადახდა ვერ შესრულდა: {reason}", "წვდომა შეჩერებულია. ნებისმიერ დროს შეგიძლიათ თავიდან გამოიწეროთ სხვა ბარათით."], null, []);

    public static MailContent Canceled(Lang lang, string name, DateTime accessUntil) => lang == Lang.En
        ? Build("subscription_canceled", "Your subscription was canceled", $"Hi {name},",
            [$"We're sorry to see you go. You keep full access until {Date(accessUntil, lang)} — changed your mind? Resume any time before then."], null, [])
        : Build("subscription_canceled", "გამოწერა გაუქმდა", $"გამარჯობა, {name}!",
            [$"სამწუხაროა, რომ მიდიხართ. სრული წვდომა გრჩებათ {Date(accessUntil, lang)}-მდე — გადაიფიქრეთ? მანამდე ნებისმიერ დროს შეგიძლიათ განაახლოთ."], null, []);

    public static MailContent Expired(Lang lang, string name, bool wasTrial) => lang == Lang.En
        ? Build("subscription_expired", wasTrial ? "Your free trial has ended" : "Your subscription has ended", $"Hi {name},",
            [wasTrial ? "Your free trial is over. Subscribe to keep reading — your progress and favorites are waiting for you." : "Your subscription has ended. Subscribe again to continue reading."], null, [])
        : Build("subscription_expired", wasTrial ? "უფასო საცდელი პერიოდი დასრულდა" : "გამოწერის ვადა ამოიწურა", $"გამარჯობა, {name}!",
            [wasTrial ? "უფასო საცდელი პერიოდი დასრულდა. გამოიწერეთ, რომ განაგრძოთ კითხვა — თქვენი პროგრესი და რჩეულები გელოდებათ." : "თქვენი გამოწერის ვადა ამოიწურა. კითხვის გასაგრძელებლად გამოიწერეთ თავიდან."], null, []);

    private static MailContent Build(string type, string subject, string greeting, string[] paragraphs, string? code, string[] after)
    {
        var lines = paragraphs.Where(p => p.Length > 0).ToArray();
        var text = string.Join("\n\n", new[] { greeting }.Concat(lines).Concat(code is null ? [] : [code]).Concat(after));
        var html = $"""
            <div style="background:#f4efe6;padding:28px 12px;font-family:'Noto Sans Georgian',Arial,sans-serif;color:#211d18">
              <div style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid #e6dccb;border-radius:16px;overflow:hidden">
                <div style="padding:18px 26px;border-bottom:1px solid #efe6d6">
                  <span style="display:inline-block;width:30px;height:30px;border-radius:8px;background:#b4352a;color:#fff;text-align:center;line-height:30px;font-size:18px;vertical-align:middle">ა</span>
                  <strong style="font-size:16px;margin-left:8px;vertical-align:middle">ანბანი · Anbani</strong>
                </div>
                <div style="padding:26px;font-size:15px;line-height:1.6">
                  <p style="margin:0 0 14px;font-size:18px;font-weight:bold">{Enc(greeting)}</p>
                  {string.Concat(lines.Select(p => $"<p style=\"margin:0 0 12px\">{Enc(p)}</p>"))}
                  {(code is null ? "" : $"<div style=\"margin:18px 0;padding:16px;text-align:center;background:#f6efe3;border:1px dashed #d4c3a6;border-radius:12px;font:700 30px/1 'Courier New',monospace;letter-spacing:10px;color:#b4352a\">{code}</div>")}
                  {string.Concat(after.Select(p => $"<p style=\"margin:0 0 12px;color:#6f675e\">{Enc(p)}</p>"))}
                </div>
                <div style="padding:14px 26px;background:#f8f3ea;font-size:12px;color:#8b8279">Anbani sandbox · STEP IT Academy — სასწავლო პროექტი</div>
              </div>
            </div>
            """;
        return new MailContent(type, subject, text, html, code);
    }

    private static string Enc(string s) => WebUtility.HtmlEncode(s);
}
