namespace BooksApi.Infrastructure;

/// <summary>
/// Throw this anywhere to return an error. ErrorHandlingMiddleware turns it into:
/// <code>
/// { "type": "...", "title": "...", "status": 402, "code": "SUBSCRIPTION_REQUIRED",
///   "detail": "localized message", "errors": { "field": ["..."] }, "traceId": "..." }
/// </code>
/// </summary>
public sealed class ApiException(int status, string code, string? detail = null, IDictionary<string, string[]>? errors = null)
    : Exception(code)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public string? Detail { get; } = detail;
    public IDictionary<string, string[]>? Errors { get; } = errors;
    /// <summary>Extra machine-readable data, e.g. retryAfter for 429.</summary>
    public Dictionary<string, object?> Extensions { get; } = [];

    public static ApiException NotFound(string code) => new(404, code);
    public static ApiException Conflict(string code, string? detail = null) => new(409, code, detail);
    public static ApiException Forbidden(string code) => new(403, code);
    public static ApiException BadRequest(string code, string? detail = null) => new(400, code, detail);
}

/// <summary>Every error code the API can return, with its default message in both languages.</summary>
public static class ErrorCatalog
{
    private static readonly Dictionary<string, (string Title, string Ka, string En)> Messages = new()
    {
        ["VALIDATION_ERROR"] = ("Validation failed", "მოთხოვნის ზოგიერთი ველი არასწორადაა შევსებული.", "Some fields are invalid."),
        ["INVALID_JSON"] = ("Malformed request", "მოთხოვნის სხეული არ არის ვალიდური JSON ან ველის ტიპი არასწორია.", "The request body is not valid JSON or a field has the wrong type."),
        ["API_KEY_MISSING"] = ("API key missing", "API გასაღები არ არის მითითებული. დაამატეთ ჰედერი X-API-KEY.", "The API key is missing. Add the X-API-KEY header."),
        ["API_KEY_INVALID"] = ("API key invalid", "API გასაღები არასწორია.", "The API key is not valid."),
        ["API_KEY_DISABLED"] = ("API key disabled", "ეს API გასაღები გათიშულია. მიმართეთ ლექტორს.", "This API key has been disabled. Contact your teacher."),
        ["AUTH_REQUIRED"] = ("Authentication required", "ამ მოქმედებისთვის საჭიროა ავტორიზაცია (Authorization: Bearer <token>).", "You need to sign in (Authorization: Bearer <token>)."),
        ["TOKEN_EXPIRED"] = ("Token expired", "წვდომის ტოკენს ვადა გაუვიდა. მიიღეთ ახალი POST /api/auth/refresh-ით.", "The access token has expired. Get a new one with POST /api/auth/refresh."),
        ["TOKEN_INVALID"] = ("Token invalid", "წვდომის ტოკენი არასწორია.", "The access token is invalid."),
        ["TOKEN_WRONG_SANDBOX"] = ("Token from another sandbox", "ეს ტოკენი სხვა API გასაღებით არის გაცემული.", "This token was issued for a different API key."),
        ["INVALID_CREDENTIALS"] = ("Invalid credentials", "ელ-ფოსტა ან პაროლი არასწორია.", "Email or password is incorrect."),
        ["INVALID_REFRESH_TOKEN"] = ("Invalid refresh token", "Refresh ტოკენი არასწორია, ვადაგასულია ან უკვე გამოყენებულია.", "The refresh token is invalid, expired or already used."),
        ["EMAIL_TAKEN"] = ("Email taken", "ეს ელ-ფოსტა უკვე დარეგისტრირებულია.", "This email is already registered."),
        ["EMAIL_NOT_VERIFIED"] = ("Email not verified", "ჯერ დაადასტურეთ ელ-ფოსტა.", "Please verify your email first."),
        ["ALREADY_VERIFIED"] = ("Already verified", "ელ-ფოსტა უკვე დადასტურებულია.", "This email is already verified."),
        ["INVALID_CODE"] = ("Invalid code", "კოდი არასწორია.", "The code is incorrect."),
        ["CODE_EXPIRED"] = ("Code expired", "კოდს ვადა გაუვიდა. მოითხოვეთ ახალი.", "The code has expired. Request a new one."),
        ["TOO_MANY_ATTEMPTS"] = ("Too many attempts", "ძალიან ბევრი არასწორი მცდელობა. მოითხოვეთ ახალი კოდი.", "Too many wrong attempts. Request a new code."),
        ["RESEND_TOO_SOON"] = ("Too soon", "ახალი კოდის მოთხოვნა შესაძლებელია 60 წამში ერთხელ.", "You can request a new code once every 60 seconds."),
        ["WRONG_PASSWORD"] = ("Wrong password", "მიმდინარე პაროლი არასწორია.", "The current password is incorrect."),
        ["USER_NOT_FOUND"] = ("User not found", "მომხმარებელი ვერ მოიძებნა.", "User not found."),
        ["BOOK_NOT_FOUND"] = ("Book not found", "წიგნი ვერ მოიძებნა.", "Book not found."),
        ["CATEGORY_NOT_FOUND"] = ("Category not found", "კატეგორია ვერ მოიძებნა.", "Category not found."),
        ["REVIEW_NOT_FOUND"] = ("Review not found", "შეფასება ვერ მოიძებნა.", "Review not found."),
        ["PLAN_NOT_FOUND"] = ("Plan not found", "გეგმა ვერ მოიძებნა.", "Plan not found."),
        ["PAYMENT_NOT_FOUND"] = ("Payment not found", "გადახდა ვერ მოიძებნა.", "Payment not found."),
        ["NOT_FOUND"] = ("Not found", "ასეთი მისამართი (endpoint) არ არსებობს. გადაამოწმეთ URL და HTTP მეთოდი.", "This endpoint does not exist. Check the URL and the HTTP method."),
        ["METHOD_NOT_ALLOWED"] = ("Method not allowed", "ამ მისამართზე ეს HTTP მეთოდი არ მუშაობს.", "This HTTP method is not allowed on this endpoint."),
        ["LOGIN_REQUIRED"] = ("Login required", "წიგნის წასაკითხად შედით სისტემაში.", "Sign in to read this book."),
        ["SUBSCRIPTION_REQUIRED"] = ("Subscription required", "სრული წიგნის წასაკითხად საჭიროა აქტიური გამოწერა ან უფასო საცდელი პერიოდი.", "An active subscription or free trial is required to read the full book."),
        ["DOWNLOAD_NOT_INCLUDED"] = ("Download not included", "ჩამოტვირთვა შედის მხოლოდ წლიურ გამოწერაში და არ მუშაობს საცდელ პერიოდში.", "Downloads are included in the annual plan only and not during a trial."),
        ["NO_PDF"] = ("No file", "ამ წიგნს ჯერ PDF ფაილი არ აქვს.", "This book has no PDF file yet."),
        ["TRIAL_ALREADY_USED"] = ("Trial already used", "უფასო საცდელი პერიოდი უკვე გამოყენებულია (ის ერთხელ ეძლევა ანგარიშს, პირველ გამოწერამდე).", "The free trial was already used (it is available once per account, before the first subscription)."),
        ["ALREADY_SUBSCRIBED"] = ("Already subscribed", "თქვენ უკვე გაქვთ აქტიური გამოწერა. გამოიყენეთ resume ან change-plan.", "You already have an active subscription. Use resume or change-plan instead."),
        ["NOTHING_TO_CANCEL"] = ("Nothing to cancel", "გასაუქმებელი აქტიური გამოწერა არ გაქვთ.", "You have no active subscription to cancel."),
        ["CANNOT_RESUME"] = ("Cannot resume", "განახლება შესაძლებელია მხოლოდ გაუქმებული, მაგრამ ჯერ კიდევ მოქმედი გამოწერისთვის.", "Only a canceled subscription that hasn't ended yet can be resumed."),
        ["SAME_PLAN"] = ("Same plan", "თქვენ უკვე ამ გეგმაზე ხართ.", "You are already on this plan."),
        ["NOT_ACTIVE"] = ("Not active", "ეს მოქმედება მხოლოდ აქტიური ფასიანი გამოწერისთვისაა.", "This action requires an active paid subscription."),
        ["NO_PAYMENT_METHOD"] = ("No payment method", "შენახული ბარათი არ გაქვთ.", "You have no saved card."),
        ["TEST_CARD_REQUIRED"] = ("Test card required", "Sandbox-ში მიიღება მხოლოდ სატესტო ბარათები (მაგ. 4242 4242 4242 4242). ნამდვილი ბარათის მონაცემები არასოდეს შეიყვანოთ!", "Only test cards are accepted in the sandbox (e.g. 4242 4242 4242 4242). Never enter real card details!"),
        ["CARD_DECLINED"] = ("Card declined", "ბანკმა ბარათი უარყო.", "The card was declined."),
        ["INSUFFICIENT_FUNDS"] = ("Insufficient funds", "ბარათზე არ არის საკმარისი თანხა.", "The card has insufficient funds."),
        ["EXPIRED_CARD"] = ("Expired card", "ბარათს ვადა გასდის.", "The card has expired."),
        ["INCORRECT_CVC"] = ("Incorrect CVC", "CVC კოდი არასწორია.", "The CVC code is incorrect."),
        ["PROCESSING_ERROR"] = ("Processing error", "გადახდის დამუშავებისას მოხდა შეცდომა. სცადეთ თავიდან.", "An error occurred while processing the payment. Try again."),
        ["ALREADY_REVIEWED"] = ("Already reviewed", "ამ წიგნს უკვე შეაფასეთ. შეგიძლიათ შეფასების რედაქტირება.", "You have already reviewed this book. Edit your review instead."),
        ["NOT_YOUR_REVIEW"] = ("Not your review", "სხვისი შეფასების შეცვლა არ შეიძლება.", "You can only change your own review."),
        ["ADMIN_ONLY"] = ("Admins only", "ეს მოქმედება მხოლოდ ადმინისტრატორს შეუძლია.", "Only admins can do this."),
        ["SYSTEM_RESOURCE"] = ("Built-in content", "ჩაშენებული სადემონსტრაციო კონტენტის შეცვლა ან წაშლა შეუძლებელია.", "Built-in demo content can't be changed or deleted."),
        ["CATEGORY_NOT_EMPTY"] = ("Category not empty", "კატეგორიაში წიგნებია. ჯერ წიგნები გადაიტანეთ ან წაშალეთ.", "The category still has books. Move or delete them first."),
        ["CATEGORY_EXISTS"] = ("Category exists", "ასეთი სახელით კატეგორია უკვე არსებობს.", "A category with this name already exists."),
        ["PDF_REQUIRED"] = ("PDF required", "გამოსაქვეყნებლად წიგნს PDF ფაილი სჭირდება.", "A book needs a PDF before it can be published."),
        ["FILE_REQUIRED"] = ("File required", "ფაილი არ არის გამოგზავნილი (multipart/form-data, ველი \"file\").", "No file was sent (multipart/form-data, field \"file\")."),
        ["FILE_TOO_LARGE"] = ("File too large", "ფაილი ძალიან დიდია.", "The file is too large."),
        ["UNSUPPORTED_FILE_TYPE"] = ("Unsupported file type", "ფაილის ეს ტიპი არ მიიღება.", "This file type is not supported."),
        ["INVALID_PDF"] = ("Invalid PDF", "ფაილი არ არის ვალიდური PDF.", "The file is not a valid PDF."),
        ["STORAGE_QUOTA_EXCEEDED"] = ("Storage quota exceeded", "თქვენი sandbox-ის ფაილების ლიმიტი ამოიწურა.", "Your sandbox file storage quota is used up."),
        ["DEMO_ACCOUNT_LOCKED"] = ("Demo account", "სადემონსტრაციო ანგარიშის ეს მონაცემი დაცულია. შექმენით საკუთარი ანგარიში.", "This demo account is protected. Create your own account."),
        ["LAST_ADMIN"] = ("Last admin", "sandbox-ში მინიმუმ ერთი ადმინისტრატორი უნდა დარჩეს.", "The sandbox must keep at least one admin."),
        ["CANNOT_CHANGE_SELF"] = ("Not on yourself", "ამ მოქმედებას საკუთარ ანგარიშზე ვერ შეასრულებთ.", "You can't do this to your own account."),
        ["LINK_EXPIRED"] = ("Link expired", "ბმულს ვადა გაუვიდა. მოითხოვეთ ახალი.", "This link has expired. Request a new one."),
        ["LINK_INVALID"] = ("Link invalid", "ბმული არასწორია.", "This link is not valid."),
        ["RATE_LIMITED"] = ("Too many requests", "ძალიან ბევრი მოთხოვნა. ცოტა ხანში სცადეთ.", "Too many requests. Try again shortly."),
        ["SELF_SERVICE_DISABLED"] = ("Disabled", "API გასაღების თვითრეგისტრაცია გათიშულია. გასაღები ლექტორისგან მიიღეთ.", "Self-service API keys are disabled. Ask your teacher for a key."),
        ["TEACHER_SECRET_INVALID"] = ("Teacher access", "ლექტორის საიდუმლო გასაღები (X-Teacher-Secret) არასწორია.", "The teacher secret (X-Teacher-Secret) is invalid."),
        ["INTERNAL_ERROR"] = ("Server error", "სერვერზე მოხდა მოულოდნელი შეცდომა.", "Something went wrong on the server."),
    };

    public static (string Title, string Message) Get(string code, Lang lang)
    {
        if (!Messages.TryGetValue(code, out var m)) return (code, code);
        return (m.Title, lang == Lang.En ? m.En : m.Ka);
    }

    public static IReadOnlyDictionary<string, (string Title, string Ka, string En)> All => Messages;
}
