# BooksAPI („ანბანი“) — ტექნიკური დოკუმენტაცია v1.0

> **„ანბანი“** — ციფრული ბიბლიოთეკა გამოწერით. API უზრუნველყოფს მომხმარებლის ავტორიზაციას, PDF წიგნების კატალოგს ძებნითა და ფილტრებით, **გამოწერას უფასო საცდელი პერიოდით**, წიგნების ბრაუზერში კითხვას, რჩეულებს, შეფასებებს და ადმინ-პანელს.
>
> ეს არის სასწავლო API: გადახდები სიმულაციაა, წერილები „სატესტო ინბოქსში“ ინახება, ხოლო დროის „გადაწევით“ შეგიძლიათ ნახოთ, რა ხდება, როცა საცდელი პერიოდი იწურება.

| | |
|---|---|
| **Base URL** | `https://booksapi.stepacademy.ge` · ლოკალურად `http://localhost:5080` |
| **პროტოკოლი** | HTTPS |
| **მონაცემთა ფორმატი** | JSON (`application/json`), ფაილების ატვირთვა — `multipart/form-data` |
| **ავტორიზაცია** | `X-API-KEY` (თქვენი sandbox) + `Authorization: Bearer <token>` (მომხმარებელი) |
| **ენა** | `Accept-Language: ka` (ნაგულისხმევი) ან `en` |
| **Swagger UI** | `/swagger` |
| **Postman კოლექცია** | `/content/postman/BooksAPI.postman_collection.json` |
| **სადემონსტრაციო საიტი** | `/app` — მზა ფრონტენდი, რომელიც ამ API-ს იყენებს |

---

## სარჩევი

1. [სწრაფი დაწყება](#სწრაფი-დაწყება)
2. [ავტორიზაცია და უსაფრთხოება](#1-ავტორიზაცია-და-უსაფრთხოება)
3. [მოთხოვნების ფორმატი](#2-მოთხოვნების-ფორმატი)
4. [შეცდომები და სტატუს კოდები](#3-შეცდომები-და-სტატუს-კოდები)
5. [ენდპოინტები](#4-ენდპოინტები)
   - [🔑 Developer](#-developer--api-გასაღები) · [🔐 Auth](#-auth--ავტორიზაცია) · [👤 Users](#-users--მომხმარებელი) · [🗂 Categories](#-categories--კატეგორიები) · [📚 Books](#-books--წიგნები) · [⭐ Reviews](#-reviews--შეფასებები) · [🔖 Library](#-library--ჩემი-ბიბლიოთეკა) · [💳 Subscription](#-plans--subscription--გამოწერა) · [🧾 Payments](#-payments--გადახდები) · [🛠 Admin](#-admin--ადმინ-პანელი) · [🧪 Sandbox](#-sandbox--სასწავლო-ინსტრუმენტები)
6. [ბიზნეს-წესები](#5-ბიზნეს-წესები)
7. [სატესტო ბარათები](#6-სატესტო-ბარათები)
8. [სცენარები ნაბიჯ-ნაბიჯ](#7-სცენარები-ნაბიჯ-ნაბიჯ)
9. [რეკომენდაციები და ხშირი შეცდომები](#8-რეკომენდაციები-და-ხშირი-შეცდომები)
10. [შეცდომის კოდების სრული სია](#9-შეცდომის-კოდების-სრული-სია)

---

## სწრაფი დაწყება

**1. მიიღეთ API გასაღები** — დეველოპერის პორტალზე (`/`) ან მოთხოვნით:

```http
POST /api/developer/keys
Content-Type: application/json

{ "name": "ნინო ბერიძე", "email": "nino@example.com", "group": "FE-2026" }
```

```json
{
  "apiKey": "anb_ccd3887af768ff8b4d0c55d00e0c72eb",
  "name": "ნინო ბერიძე",
  "email": "nino@example.com",
  "group": "FE-2026",
  "createdAt": "2026-10-15T00:27:53Z",
  "note": "შეინახეთ ეს გასაღები და გამოგზავნეთ ყველა მოთხოვნაში ჰედერით X-API-KEY. მისი თავიდან ნახვა შეუძლებელია."
}
```

> 💡 გასაღები ერთხელ გამოჩნდება — შეინახეთ `.env` ფაილში (მაგ. `VITE_API_KEY=...`) და **არ** ჩადოთ კოდში პირდაპირ.

**2. შეამოწმეთ, რომ მუშაობს:**

```bash
curl https://booksapi.stepacademy.ge/api/books?pageSize=3 \
  -H "X-API-KEY: anb_ccd3887af768ff8b4d0c55d00e0c72eb"
```

**3. დაარეგისტრირეთ მომხმარებელი** → `POST /api/auth/register` (პასუხში უკვე არის ტოკენები).

**4. დაადასტურეთ ელ-ფოსტა** → კოდი ნახეთ `GET /api/sandbox/inbox?email=...`-ში და გაგზავნეთ `POST /api/auth/verify-email`-ზე.

**5. დაიწყეთ უფასო საცდელი პერიოდი** → `POST /api/subscription/trial`, შემდეგ `GET /api/books/{id}/read` — და წაიკითხეთ წიგნი 🎉

JavaScript-ში (fetch):

```js
const API = 'https://booksapi.stepacademy.ge';
const API_KEY = import.meta.env.VITE_API_KEY;

const res = await fetch(`${API}/api/books?sort=rating&pageSize=12`, {
  headers: { 'X-API-KEY': API_KEY, 'Accept-Language': 'ka' },
});
if (!res.ok) throw await res.json();      // { code, detail, errors? }
const { items, totalPages } = await res.json();
```

---

## 1. ავტორიზაცია და უსაფრთხოება

### 1.1 ორი გასაღები — ორი სხვადასხვა კითხვა

| ჰედერი | რას ამბობს | საიდან ვიღებთ | როდის სჭირდება |
|---|---|---|---|
| `X-API-KEY: anb_…` | **რომელი აპლიკაცია (sandbox) ითხოვს** | დეველოპერის პორტალიდან | **ყველა** `/api/...` მოთხოვნას (გარდა `POST /api/developer/keys`) |
| `Authorization: Bearer eyJ…` | **რომელი მომხმარებელია შესული** | `/api/auth/login`, `register`, `refresh`, `verify-email` | 🔒-ით მონიშნულ ენდპოინტებს |

ეს რეალური API-ების (Stripe, Google Maps...) პრინციპია: გასაღები ეკუთვნის **პროექტს**, ტოკენი — **მომხმარებელს**.

**Sandbox.** თითოეული API გასაღები ცალკე „სამყაროა“: მომხმარებლები, გამოწერები, შეფასებები და თქვენ მიერ დამატებული წიგნები მხოლოდ თქვენს გასაღებზე ჩანს. ამიტომ ორ სტუდენტს შეუძლია ერთი და იგივე ელ-ფოსტით დარეგისტრირდეს. ჩაშენებული ბიბლიოთეკა (30 წიგნი, 9 კატეგორია) ყველა sandbox-ში ერთნაირია და მხოლოდ საკითხავადაა.

### 1.2 ტოკენები

| | Access token | Refresh token |
|---|---|---|
| ფორმატი | JWT (`header.payload.signature`) | შემთხვევითი სტრიქონი |
| ვადა | **15 წუთი** (`expiresIn: 900` წამი) | **30 დღე** |
| სად იგზავნება | `Authorization: Bearer <accessToken>` | მხოლოდ `POST /api/auth/refresh`-ის სხეულში |
| თუ მოიპარეს | 15 წუთში თავისით მოკვდება | ყოველ გამოყენებაზე იცვლება (rotation) |

JWT-ის შიგთავსი (payload) ნებისმიერს შეუძლია წაიკითხოს — ის **ხელმოწერილია**, არა დაშიფრული:

```json
{ "sub": "45", "tid": "12", "role": "Admin", "email": "nino@example.com",
  "given_name": "Nino", "family_name": "Beridze", "exp": 1792032173 }
```

`sub` — მომხმარებლის id, `tid` — sandbox-ის (API გასაღების) id, `role` — `User` ან `Admin`.

### 1.3 ნაკადი (Flow)

```
რეგისტრაცია/შესვლა ─► { accessToken, refreshToken, user }
        │
        ▼
  ყველა მოთხოვნა:  Authorization: Bearer <accessToken>
        │
        ▼  15 წუთის შემდეგ…
  401 { "code": "TOKEN_EXPIRED" }
        │
        ▼
  POST /api/auth/refresh { refreshToken } ─► ახალი accessToken + ახალი refreshToken
        │                                     (ძველი refreshToken აღარ მუშაობს!)
        ▼
  იგივე მოთხოვნის გამეორება
        │
        ▼  refresh-მაც 401 დააბრუნა?
  მომხმარებელი გამოდის სისტემიდან → /login
```

**მნიშვნელოვანი დეტალები:**

- ტოკენით გაგზავნილი მოთხოვნა ყოველთვის მოწმდება — **საჯარო ენდპოინტებზეც**. თუ `GET /api/books`-ს ვადაგასულ ტოკენს გაუგზავნით, მიიღებთ `401 TOKEN_EXPIRED`-ს (და არა ტოკენის გარეშე პასუხს). ასე ვერ „დაიმალება“ ვადაგასული ტოკენი.
- `/api/auth/*` ენდპოინტები `Authorization` ჰედერს **არ ამოწმებს** — ამიტომ refresh მუშაობს მაშინაც, თუ თქვენი interceptor ძველ ტოკენს ავტომატურად ურთავს.
- ერთი და იგივე refresh token მეორედ გამოყენებისას → `401 INVALID_REFRESH_TOKEN`. თუ რამდენიმე მოთხოვნა ერთდროულად მიიღებს `TOKEN_EXPIRED`-ს, refresh **ერთხელ** უნდა გაეშვას (იხ. კოდი ქვემოთ).
- პაროლის შეცვლა ან აღდგენა აუქმებს ყველა refresh token-ს (ყველა მოწყობილობაზე გამოსვლა).

### 1.4 რეკომენდებული კოდი: interceptor

**fetch-ით:**

```js
let refreshing = null; // ერთდროულად მხოლოდ ერთი refresh

async function api(path, options = {}, retry = true) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'X-API-KEY': API_KEY,
      'Accept-Language': lang,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (res.ok) return data;

  if (res.status === 401 && data?.code === 'TOKEN_EXPIRED' && retry) {
    refreshing ??= refresh().finally(() => (refreshing = null));
    if (await refreshing) return api(path, options, false); // გამეორება ახალი ტოკენით
  }
  throw data; // { status, code, detail, errors? }
}

async function refresh() {
  const res = await fetch(API + '/api/auth/refresh', {
    method: 'POST',
    headers: { 'X-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  if (!res.ok) { logout(); return false; }
  saveSession(await res.json());
  return true;
}
```

**axios-ით:**

```js
const http = axios.create({ baseURL: API });

http.interceptors.request.use((config) => {
  config.headers['X-API-KEY'] = API_KEY;
  config.headers['Accept-Language'] = lang;
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing = null;
http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { response, config } = error;
    if (response?.status === 401 && response.data?.code === 'TOKEN_EXPIRED' && !config._retry) {
      config._retry = true;
      refreshing ??= axios
        .post(`${API}/api/auth/refresh`, { refreshToken: localStorage.getItem('refreshToken') },
              { headers: { 'X-API-KEY': API_KEY } })
        .then(({ data }) => {
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken);
        })
        .finally(() => (refreshing = null));
      try { await refreshing; } catch { logout(); return Promise.reject(error); }
      return http(config);
    }
    return Promise.reject(error);
  },
);
```

### 1.5 როლები

| როლი | რა შეუძლია |
|---|---|
| `user` | კატალოგი, კითხვა (გამოწერით), რჩეულები, შეფასებები, საკუთარი ანგარიში და გამოწერა |
| `admin` | ყველაფერი ზემოთ + წიგნებისა და კატეგორიების მართვა, მომხმარებლები, გადახდები, სტატისტიკა |

**sandbox-ში პირველი დარეგისტრირებული მომხმარებელი ავტომატურად `admin` ხდება** (და შემდეგ — თუ ყველა ადმინი წაიშალა). ჩვეულებრივი მომხმარებლის სცენარების შესამოწმებლად დაარეგისტრირეთ მეორე ანგარიში, ან ადმინ-პანელიდან შეცვალეთ როლი.

> ⚠️ ადმინი **არ** კითხულობს ჩაშენებულ წიგნებს გამოწერის გარეშე — გადახდის სცენარი პირველ ანგარიშზეც შეგიძლიათ შეამოწმოთ. ადმინს გამოწერის გარეშე მხოლოდ საკუთარი, ატვირთული წიგნები ეხსნება (შესამოწმებლად).

---

## 2. მოთხოვნების ფორმატი

### 2.1 ჰედერები

| ჰედერი | მნიშვნელობა | სავალდებულო |
|---|---|---|
| `X-API-KEY` | თქვენი გასაღები | ✅ ყველა `/api` მოთხოვნაზე |
| `Authorization` | `Bearer <accessToken>` | 🔒 ენდპოინტებზე |
| `Content-Type` | `application/json` ან `multipart/form-data` (ფაილები) | სხეულიან მოთხოვნებზე |
| `Accept-Language` | `ka` (ნაგულისხმევი) ან `en` | არა — ცვლის შეცდომების, კატეგორიების, გეგმების და აღწერების ენას |

### 2.2 პაგინაცია

სიის ყველა ენდპოინტი იღებს `page` (1-დან) და `pageSize` პარამეტრებს და აბრუნებს ერთნაირ „კონვერტს“:

```json
{
  "items": [ /* ... */ ],
  "page": 1,
  "pageSize": 12,
  "totalItems": 30,
  "totalPages": 3,
  "hasMore": true
}
```

- `totalPages` — ნუმერაციიანი პაგინაციისთვის (1 2 3 …)
- `hasMore` — „მეტის ჩატვირთვა“ ღილაკისთვის ან infinite scroll-ისთვის
- არასწორი მნიშვნელობა (`page=0`, `pageSize=500`) → `400 VALIDATION_ERROR`

### 2.3 მონაცემთა ტიპები

| რა | ფორმატი | მაგალითი |
|---|---|---|
| თარიღი/დრო | ISO 8601, UTC (`Z`) | `"2026-10-15T00:27:53.511Z"` → `new Date(value)` |
| ფული | ათწილადი + ვალუტა | `"price": 12.99, "currency": "GEL"` → „12,99 ₾“ |
| enum | camelCase სტრიქონი | `"status": "trialing"`, `"role": "admin"` |
| წელი | მთელი რიცხვი; უარყოფითი = ძვ. წ. | `"year": -500` („ხელოვნება ომისა“) — ჩვენებისთვის გამოიყენეთ `yearLabel` |

query პარამეტრების სახელები რეგისტრს არ განასხვავებს: `?page=2` და `?Page=2` ერთი და იგივეა.

### 2.4 ფაილების URL-ები

წიგნის ყდა, ფრაგმენტი და ავატარი API-დან **სრული URL-ით** მოდის და ჰედერებს არ საჭიროებს — პირდაპირ ჩასვით `<img src>`-ში ან PDF.js-ში:

```json
"coverUrl": "https://booksapi.stepacademy.ge/files/covers/s-aluda-ketelauri?v=1792021581",
"previewUrl": "https://booksapi.stepacademy.ge/files/previews/s-aluda-ketelauri.pdf"
```

სრული წიგნი კი **დაცულია**: მისი ბმული მხოლოდ `GET /api/books/{id}/read`-ით მიიღება და 2 საათში ვადა გასდის (signed URL). რატომ? `<iframe src>` და PDF.js ვერ აგზავნის `Authorization` ჰედერს — ამიტომ უფლებას თავად ბმული „ატარებს“ ხელმოწერის სახით (ისევე როგორც Amazon S3-ის pre-signed URL).

---

## 3. შეცდომები და სტატუს კოდები

### 3.1 შეცდომის ფორმატი

ყველა შეცდომა ერთნაირია (RFC 7807 „Problem Details“ + სტაბილური `code`):

```json
{
  "type": "https://booksapi.stepacademy.ge/docs#VALIDATION_ERROR",
  "title": "Validation failed",
  "status": 400,
  "code": "VALIDATION_ERROR",
  "detail": "მოთხოვნის ზოგიერთი ველი არასწორადაა შევსებული.",
  "errors": {
    "firstName": ["მინიმუმ 2 სიმბოლო."],
    "lastName": ["ველი სავალდებულოა."],
    "email": ["ელ-ფოსტის ფორმატი არასწორია."],
    "password": ["პაროლი უნდა შედგებოდეს მინიმუმ 8 სიმბოლოსგან და შეიცავდეს ასოს და ციფრს."]
  },
  "traceId": "0HNPAA8V8804I:00000002"
}
```

| ველი | რისთვის |
|---|---|
| `code` | **პროგრამისთვის** — `if (err.code === 'TOKEN_EXPIRED')`. არასოდეს შეედაროთ `detail`-ს! |
| `detail` | **ადამიანისთვის** — ნათარგმნი შეტყობინება (`Accept-Language`-ის მიხედვით), შეგიძლიათ toast-ში აჩვენოთ |
| `errors` | მხოლოდ 400-ზე: ველის სახელი → შეტყობინებები. სახელები ემთხვევა JSON ველებს (ჩადგმულისთვის — `card.number`) |
| `traceId` | სერვერის ლოგში ამ მოთხოვნის საპოვნელად (ბაგის რეპორტში ჩასვით) |

### 3.2 სტატუს კოდები — და რა უნდა გააკეთოს UI-მ

| კოდი | მნიშვნელობა | რა უნდა გააკეთოს ფრონტენდმა |
|---|---|---|
| `200 OK` | წარმატება | აჩვენეთ შედეგი |
| `201 Created` | შეიქმნა (რეგისტრაცია, შეფასება, წიგნი, კატეგორია) | აჩვენეთ ახალი ჩანაწერი / გადადით მის გვერდზე |
| `204 No Content` | წარმატება, სხეულის გარეშე (წაშლა, გასვლა) | **არ** გამოიძახოთ `res.json()` |
| `400 Bad Request` | ვალიდაცია (`VALIDATION_ERROR`) ან არასწორი JSON (`INVALID_JSON`) | `errors` გაანაწილეთ ფორმის ველებზე |
| `401 Unauthorized` | API გასაღები/ტოკენი არ არის ან არასწორია | `TOKEN_EXPIRED` → refresh და გამეორება; სხვა → გადაიყვანეთ `/login`-ზე |
| `402 Payment Required` | გამოწერა საჭიროა ან ბარათი უარყოფილია | აჩვენეთ paywall: „დაიწყე უფასოდ“ / „გამოიწერე“; ბარათზე — `detail` |
| `403 Forbidden` | უფლება არ გაქვთ (არა-ადმინი, ელ-ფოსტა დაუდასტურებელია, ჩამოტვირთვა არ შედის გეგმაში…) | ახსენით მიზეზი, დამალეთ/გათიშეთ ღილაკი |
| `404 Not Found` | ჩანაწერი ან მისამართი არ არსებობს | „ვერ მოიძებნა“ გვერდი |
| `405 Method Not Allowed` | არასწორი HTTP მეთოდი | შეამოწმეთ დოკუმენტაცია (POST vs PUT) |
| `409 Conflict` | მდგომარეობასთან კონფლიქტი (ელ-ფოსტა დაკავებულია, საცდელი უკვე გამოყენებულია, უკვე შეფასებულია…) | აჩვენეთ `detail`, განაახლეთ მდგომარეობა |
| `413` / `415` | ფაილი ძალიან დიდია / ტიპი არ მიიღება | ფაილის შეზღუდვები აჩვენეთ ატვირთვამდე |
| `429 Too Many Requests` | ძალიან ბევრი მოთხოვნა | დაელოდეთ `Retry-After` წამს |
| `500 Internal Server Error` | სერვერის შეცდომა | „რაღაც არ გამოვიდა“ + `traceId` |

---

## 4. ენდპოინტები

**აღნიშვნები:** 🔓 მხოლოდ `X-API-KEY` · 🔑 გასაღები არ სჭირდება · 🔒 საჭიროა `Bearer` ტოკენი · 🛡 საჭიროა `admin` როლი · 💳 საჭიროა აქტიური გამოწერა/საცდელი

### 🔑 Developer — API გასაღები

| მეთოდი | URL | | აღწერა |
|---|---|---|---|
| POST | `/api/developer/keys` | 🔑 | ახალი გასაღების შექმნა (საათში 10 მოთხოვნა ერთი IP-დან) |
| GET | `/api/developer/me` | 🔓 | ინფორმაცია მიმდინარე გასაღებზე: მოთხოვნების რაოდენობა, მომხმარებლები, ფაილების მოცულობა |

---

### 🔐 Auth — ავტორიზაცია

| მეთოდი | URL | | აღწერა |
|---|---|---|---|
| POST | `/api/auth/register` | 🔓 | რეგისტრაცია. აბრუნებს ტოკენებს, ელ-ფოსტაზე აგზავნის 6-ნიშნა კოდს |
| POST | `/api/auth/login` | 🔓 | შესვლა |
| POST | `/api/auth/refresh` | 🔓 | ახალი ტოკენები refresh token-ით (ძველი უქმდება) |
| POST | `/api/auth/logout` | 🔓 | refresh token-ის გაუქმება · `204` |
| POST | `/api/auth/verify-email` | 🔓 | ელ-ფოსტის დადასტურება კოდით. აბრუნებს ახალ ტოკენებს |
| POST | `/api/auth/resend-verification` | 🔓 | კოდის თავიდან გაგზავნა (60 წამში ერთხელ) |
| POST | `/api/auth/forgot-password` | 🔓 | პაროლის აღდგენის კოდის გაგზავნა |
| POST | `/api/auth/reset-password` | 🔓 | ახალი პაროლი კოდით |

> auth ენდპოინტებზე მოქმედებს ლიმიტი: 30 მოთხოვნა წუთში (`429 RATE_LIMITED`).

#### POST /api/auth/register

```json
{
  "firstName": "Nino",
  "lastName": "Beridze",
  "email": "nino@example.com",
  "password": "Reading2026"
}
```

| ველი | წესი |
|---|---|
| `firstName`, `lastName` | სავალდებულო, 2–50 სიმბოლო |
| `email` | სავალდებულო, ვალიდური, sandbox-ში უნიკალური (`409 EMAIL_TAKEN`) |
| `password` | მინიმუმ 8 სიმბოლო, ერთი ასო და ერთი ციფრი მაინც |

**პასუხი `201 Created`** (`AuthResponse`) — იგივეა `login`, `refresh` და `verify-email`-ზე:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
  "refreshToken": "hZjg-MJPZRTIhNj8bbyefLJ5yuy_qohULE0QyIxRmDebtVtnGQHlRB8I-Jn4y_PJ",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "accessTokenExpiresAt": "2026-10-15T00:42:53.879Z",
  "user": {
    "id": 45,
    "firstName": "Nino",
    "lastName": "Beridze",
    "fullName": "Nino Beridze",
    "email": "nino@example.com",
    "role": "admin",
    "isVerified": false,
    "avatarUrl": null,
    "createdAt": "2026-10-15T00:27:53.511Z",
    "subscription": { "status": "none", "planCode": null, "isTrial": false, "hasAccess": false, "accessUntil": null }
  }
}
```

> რეგისტრაციისთანავე მომხმარებელი **შესულია**, მაგრამ `isVerified: false`. მას შეუძლია დაათვალიეროს და წაიკითხოს ფრაგმენტები/უფასო წიგნები, თუმცა **საცდელი პერიოდის დაწყება და გადახდა** მხოლოდ დადასტურების შემდეგ შეიძლება (`403 EMAIL_NOT_VERIFIED`).

შეცდომები: `400 VALIDATION_ERROR`, `409 EMAIL_TAKEN`.

#### POST /api/auth/login

```json
{ "email": "nino@example.com", "password": "Reading2026" }
```

`200` → `AuthResponse` · `401 INVALID_CREDENTIALS` (არ ვამბობთ, ელ-ფოსტაა არასწორი თუ პაროლი — უსაფრთხოების მიზნით).

#### POST /api/auth/refresh

```json
{ "refreshToken": "hZjg-MJPZRTIhNj8bbyefLJ5…" }
```

`200` → ახალი `AuthResponse` (ახალი `refreshToken`-ით!) · `401 INVALID_REFRESH_TOKEN` (არასწორი, ვადაგასული ან უკვე გამოყენებული).

#### POST /api/auth/verify-email

```json
{ "email": "nino@example.com", "code": "701034" }
```

`200` → `AuthResponse` (`user.isVerified: true`) და მისასალმებელი წერილი.

| შეცდომა | როდის |
|---|---|
| `400 INVALID_CODE` | კოდი არასწორია. პასუხში `attemptsLeft` — დარჩენილი ცდები |
| `400 CODE_EXPIRED` | კოდს 15 წუთი აქვს |
| `429 TOO_MANY_ATTEMPTS` | 5 არასწორი ცდის შემდეგ — მოითხოვეთ ახალი კოდი |
| `409 ALREADY_VERIFIED` | უკვე დადასტურებულია |

#### POST /api/auth/resend-verification · POST /api/auth/forgot-password

```json
{ "email": "nino@example.com" }
```

ორივე ყოველთვის აბრუნებს `200`-ს ზოგადი ტექსტით (`{ "message": "თუ ასეთი ანგარიში არსებობს, ..." }`) — ასე ვერავინ გაარკვევს, რომელი ელ-ფოსტაა დარეგისტრირებული. `resend` 60 წამში ერთხელ (`429 RESEND_TOO_SOON`).

#### POST /api/auth/reset-password

```json
{ "email": "nino@example.com", "code": "482913", "newPassword": "NewPass2026" }
```

`200 { "message": "პაროლი შეიცვალა..." }` — ყველა სესია უქმდება, მომხმარებელმა თავიდან უნდა შევიდეს. შეცდომები: `INVALID_CODE`, `CODE_EXPIRED`, `VALIDATION_ERROR`.

---

### 👤 Users — მომხმარებელი

| მეთოდი | URL | | აღწერა |
|---|---|---|---|
| GET | `/api/users/me` | 🔒 | მოკლე ინფორმაცია + გამოწერის სტატუსი (ჰედერისთვის) |
| GET | `/api/users/profile` | 🔒 | სრული პროფილი |
| PUT | `/api/users/profile` | 🔒 | პროფილის რედაქტირება |
| PUT | `/api/users/change-password` | 🔒 | პაროლის შეცვლა |
| POST | `/api/users/avatar` | 🔒 | ავატარის ატვირთვა (`multipart/form-data`, ველი `file`) |
| DELETE | `/api/users/avatar` | 🔒 | ავატარის წაშლა |
| DELETE | `/api/users/me` | 🔒 | ანგარიშის სამუდამოდ წაშლა · `204` |

#### GET /api/users/me

```json
{
  "id": 45, "firstName": "Nino", "lastName": "Beridze", "fullName": "Nino Beridze",
  "email": "nino@example.com", "role": "user", "isVerified": true, "avatarUrl": null,
  "createdAt": "2026-10-15T00:27:53.511Z",
  "subscription": { "status": "trialing", "planCode": "annual", "isTrial": true, "hasAccess": true, "accessUntil": "2026-10-22T00:27:54.241Z" }
}
```

> 💡 `subscription` აქ მოკლე ვერსიაა — ჰედერში ბეჯის („საცდელი · 5 დღე“) საჩვენებლად. სრული ინფორმაცია: `GET /api/subscription`.

#### PUT /api/users/profile

```json
{ "firstName": "Nino", "lastName": "Beridze", "phone": "+995 555 12 34 56", "bio": "ვკითხულობ ყველაფერს." }
```

`firstName`/`lastName` — სავალდებულო (2–50), `phone` — `+995 555 12 34 56` ფორმატი (არასავალდებულო), `bio` — მაქს. 300. პასუხი: `ProfileDto` (`phone`, `bio`, `verifiedAt`, `lastLoginAt`...).

#### PUT /api/users/change-password

```json
{ "currentPassword": "Reading2026", "newPassword": "Reading2027" }
```

`400 WRONG_PASSWORD` (შეცდომა `errors.currentPassword`-შიც მოდის) · სხვა სესიები უქმდება.

#### POST /api/users/avatar

```js
const form = new FormData();
form.append('file', input.files[0]);      // JPG, PNG ან WEBP, მაქს. 3 MB
await fetch(`${API}/api/users/avatar`, { method: 'POST', headers: { 'X-API-KEY': KEY, Authorization: `Bearer ${token}` }, body: form });
// ⚠️ Content-Type-ს ნუ დააყენებთ ხელით — ბრაუზერი თავად დაამატებს boundary-ს
```

`200 { "avatarUrl": "https://…/files/avatars/…" }` · `413 FILE_TOO_LARGE` · `415 UNSUPPORTED_FILE_TYPE` (SVG არ მიიღება — მას შეიძლება JavaScript ჰქონდეს).

#### DELETE /api/users/me

`204`. სადემონსტრაციო ანგარიშებზე — `403 DEMO_ACCOUNT_LOCKED`; ბოლო ადმინზე, როცა sandbox-ში სხვებიც არიან — `409 LAST_ADMIN`.

---

### 🗂 Categories — კატეგორიები

| მეთოდი | URL | | აღწერა |
|---|---|---|---|
| GET | `/api/categories` | 🔓 | კატეგორიების სია (წიგნების რაოდენობით) |
| GET | `/api/categories/{id}` | 🔓 | ერთი კატეგორია |
| POST | `/api/categories` | 🛡 | შექმნა |
| PUT | `/api/categories/{id}` | 🛡 | რედაქტირება (მხოლოდ საკუთარი) |
| DELETE | `/api/categories/{id}` | 🛡 | წაშლა (მხოლოდ ცარიელი) · `204` |

```json
[
  { "id": 1, "name": "ქართული პროზა", "nameEn": "Georgian Prose", "slug": "georgian", "bookCount": 7, "isSystem": true, "canEdit": false },
  { "id": 2, "name": "პოეზია", "nameEn": "Poetry", "slug": "poetry", "bookCount": 4, "isSystem": true, "canEdit": false }
]
```

`name` ენის მიხედვით ბრუნდება (`Accept-Language: en` → `"Georgian Prose"`). `isSystem: true` — ჩაშენებული (შეცვლა → `403 SYSTEM_RESOURCE`).

**POST / PUT:** `{ "name": "პროგრამირება", "nameEn": "Programming" }` — `name` 2–40 სიმბოლო; დუბლიკატი → `409 CATEGORY_EXISTS`. წაშლისას თუ კატეგორიაში წიგნებია → `409 CATEGORY_NOT_EMPTY`.

---

### 📚 Books — წიგნები

| მეთოდი | URL | | აღწერა |
|---|---|---|---|
| GET | `/api/books` | 🔓 | სია: ძებნა, ფილტრები, სორტირება, პაგინაცია |
| GET | `/api/books/{id}` | 🔓 | დეტალები: აღწერა, სარჩევი, რეიტინგი, `access` |
| GET | `/api/books/{id}/related` | 🔓 | მსგავსი წიგნები (`?take=6`) |
| GET | `/api/books/{id}/read` | 🔒 💳 | სრული PDF-ის დროებითი ბმული |
| GET | `/api/books/{id}/download` | 🔒 💳 | ჩამოტვირთვის ბმული (მხოლოდ წლიური გეგმა) |
| POST | `/api/books` | 🛡 | წიგნის შექმნა (draft) |
| PUT | `/api/books/{id}` | 🛡 | რედაქტირება / გამოქვეყნება |
| DELETE | `/api/books/{id}` | 🛡 | წაშლა · `204` |
| PUT | `/api/books/{id}/pdf` | 🛡 | PDF-ის ატვირთვა (`multipart/form-data`, ველი `file`) |
| PUT | `/api/books/{id}/cover` | 🛡 | ყდის ატვირთვა |
| DELETE | `/api/books/{id}/cover` | 🛡 | ატვირთული ყდის წაშლა |

> 💡 ავტორიზებული მოთხოვნისას წიგნებს ემატება პირადი ველები: `isFavorite` (true/false) და `progress` (კითხვის პროგრესი ან `null`). სტუმრისთვის `isFavorite: null`.

#### GET /api/books — ფილტრები

| პარამეტრი | ტიპი | აღწერა |
|---|---|---|
| `q` | string | ძებნა სათაურში, ავტორში, მთარგმნელსა და თეგებში |
| `categoryId` | int | კატეგორია |
| `language` | `ka` \| `en` | ტექსტის ენა |
| `isFree` | bool | `true` — მხოლოდ უფასო წიგნები |
| `minRating` | double 0–5 | მინიმალური რეიტინგი |
| `minPages`, `maxPages` | int | მოცულობა |
| `yearFrom`, `yearTo` | int | გამოცემის წელი (ძვ. წ. — უარყოფითი) |
| `sort` | `popular` (ნაგულ.) \| `rating` \| `newest` \| `title` \| `year` \| `pages` | სორტირება |
| `order` | `asc` \| `desc` | მიმართულება (თითოეულ sort-ს აქვს ლოგიკური ნაგულისხმევი) |
| `page`, `pageSize` | int | 1-დან; `pageSize` ≤ 48 (ნაგულ. 12) |
| `includeDrafts` | bool | 🛡 მხოლოდ ადმინისთვის — draft წიგნებიც |

```http
GET /api/books?q=wells&language=en&sort=rating&page=1&pageSize=12
```

```json
{
  "items": [
    {
      "id": 6,
      "title": "ჯაყოს ხიზნები",
      "author": "მიხეილ ჯავახიშვილი",
      "coverUrl": "https://booksapi.stepacademy.ge/files/covers/s-jakos-khiznebi?v=1792021581",
      "category": { "id": 1, "name": "ქართული პროზა", "slug": "georgian" },
      "language": "ka",
      "year": 1925,
      "yearLabel": "1925 წ.",
      "pages": 313,
      "readingMinutes": 300,
      "rating": 4.9,
      "ratingCount": 1034,
      "readers": 6120,
      "isFree": false,
      "isNew": true,
      "isFavorite": false,
      "progress": null,
      "isPublished": true,
      "isSystem": true
    }
  ],
  "page": 1, "pageSize": 12, "totalItems": 30, "totalPages": 3, "hasMore": true
}
```

> 💡 **UI-ში ფილტრები URL-ში შეინახეთ** (`/books?categoryId=2&page=3`) — ასე გვერდის განახლება, ბმულის გაზიარება და „უკან“ ღილაკი სწორად იმუშავებს. ძებნის ველზე გამოიყენეთ debounce (~300ms), რომ ყოველ ასოზე მოთხოვნა არ გაიგზავნოს.

#### GET /api/books/{id}

`BookSummary`-ის ყველა ველი, პლუს:

```json
{
  "id": 9,
  "title": "ალუდა ქეთელაური",
  "author": "ვაჟა-ფშაველა",
  "...": "…",
  "description": "ხევსური მეომარი ალუდა ქეთელაური ბრძოლაში ქისტ მუცალს კლავს, …",
  "translator": null,
  "tags": ["პოემა", "მთა"],
  "previewUrl": "https://booksapi.stepacademy.ge/files/previews/s-aluda-ketelauri.pdf",
  "previewPages": 8,
  "chapters": [
    { "title": "I", "page": 5, "level": 0 },
    { "title": "II", "page": 9, "level": 0 }
  ],
  "ratingBreakdown": { "5": 544, "4": 146, "3": 11, "2": 0, "1": 1 },
  "access": { "canRead": true, "canDownload": true, "canPreview": true, "reason": "free" },
  "hasPdf": true,
  "canEdit": false,
  "source": { "name": "ვიკიწყარო", "url": "https://ka.wikisource.org/wiki/…" },
  "createdAt": "2026-07-22T23:46:21.911Z",
  "updatedAt": "2026-10-14T23:46:21.911Z"
}
```

**`access` — რომელი ღილაკი ვაჩვენოთ:**

| `access.reason` | ნიშნავს | რეკომენდებული UI |
|---|---|---|
| `free` | უფასო წიგნი, მომხმარებელი შესულია | „კითხვა“ |
| `trial` | საცდელი პერიოდით | „კითხვა“ + „საცდელი · დარჩა X დღე“ |
| `subscription` | აქტიური გამოწერით | „კითხვა“ (+ „ჩამოტვირთვა“, თუ `canDownload`) |
| `admin` | ადმინის მიერ ატვირთული წიგნი | „კითხვა“ |
| `loginRequired` | სტუმარია | „შედით, რომ წაიკითხოთ“ + „ფრაგმენტი“ |
| `subscriptionRequired` | შესულია, გამოწერა არ აქვს | „დაიწყე უფასოდ“ ან „გამოიწერე“ + „ფრაგმენტი“ |
| `noFile` | PDF ჯერ არ არის | „მალე“ |

> ⚠️ `access` მხოლოდ **მინიშნებაა** UI-სთვის. სერვერი წვდომას თავად ამოწმებს `/read`-ზე — ღილაკის დამალვა უსაფრთხოება არ არის.

**`chapters`** — სარჩევი: `page` არის PDF-ის გვერდის ნომერი (1-დან), შეგიძლიათ მკითხველი პირდაპირ იმ გვერდზე გახსნათ. `level: 1` — ქვეთავი (ნაწილის შიგნით).

#### GET /api/books/{id}/read 🔒 💳

```json
{
  "url": "https://booksapi.stepacademy.ge/files/books/MTIuNDUuNS5yLjE3OTIwMzEyNzQ.Muspvn637zKDW_UZK0tv7DFA",
  "expiresAt": "2026-10-15T02:27:54.274Z",
  "fileName": "pride-and-prejudice.pdf",
  "totalPages": 452,
  "lastPage": 42
}
```

- `url` — ჰედერების გარეშე მუშაობს: `<iframe src={url}>`, `<embed>`, ან PDF.js-ით `pdfjsLib.getDocument(url)`. ვადა — 2 საათი; ვადის გასვლის შემდეგ ბმული აბრუნებს `403 LINK_EXPIRED` — უბრალოდ თავიდან გამოიძახეთ `/read`.
- `lastPage` — სადაც მომხმარებელი გაჩერდა (ან `null`) — გახსენით ამ გვერდზე.
- ფაილი Range მოთხოვნებს უჭერს მხარს (`206 Partial Content`), ამიტომ დიდი PDF-იც სწრაფად იხსნება.

| შეცდომა | როდის |
|---|---|
| `401 AUTH_REQUIRED` | ტოკენი არ არის |
| `402 SUBSCRIPTION_REQUIRED` | გამოწერა/საცდელი არ აქვს და წიგნი უფასო არ არის |
| `409 NO_PDF` | წიგნს PDF ჯერ არ აქვს |

**ფრაგმენტი** (`previewUrl`) ყველასთვის ღიაა — ავტორიზაციის გარეშე.

#### GET /api/books/{id}/download 🔒 💳

იგივე პასუხი, ოღონდ ბმული ფაილს „ჩამოსატვირთად“ აბრუნებს (`Content-Disposition: attachment`): `window.location.href = link.url`.

`403 DOWNLOAD_NOT_INCLUDED` — ჩამოტვირთვა შედის მხოლოდ **წლიურ** გეგმაში და **არა** საცდელ პერიოდში. უფასო წიგნები ყველა შესულ მომხმარებელს ჩამოეტვირთება.

#### POST /api/books 🛡 · PUT /api/books/{id} 🛡

```json
{
  "title": "JavaScript-ის საფუძვლები",
  "author": "ნინო ბერიძე",
  "translator": null,
  "description": "მოკლე სახელმძღვანელო დამწყებთათვის: ცვლადები, ფუნქციები, მასივები და ობიექტები.",
  "descriptionEn": null,
  "categoryId": 10,
  "language": "ka",
  "year": 2026,
  "isFree": false,
  "tags": ["javascript", "დამწყებთათვის"]
}
```

| ველი | წესი |
|---|---|
| `title` | 1–150 · სავალდებულო შექმნისას |
| `author` | 2–100 · სავალდებულო შექმნისას |
| `description` | 20–4000 · სავალდებულო შექმნისას |
| `categoryId` | არსებული კატეგორია · სავალდებულო შექმნისას |
| `language` | `ka` \| `en` · სავალდებულო შექმნისას |
| `year` | −3000 … მიმდინარე წელი |
| `tags` | ≤ 10, თითოეული 1–30 სიმბოლო |
| `isPublished` | `true` მხოლოდ PDF-ის ატვირთვის შემდეგ → თორემ `409 PDF_REQUIRED` |

- `POST` → `201` + `BookDetails`. ახალი წიგნი ყოველთვის **draft**-ია (`isPublished: false`) — მას მხოლოდ ადმინები ხედავენ.
- `PUT` → გაგზავნეთ **მხოლოდ შესაცვლელი ველები**; `null`/არ არსებული ველი = „არ შეიცვალოს“. მაგ. გამოქვეყნება: `PUT /api/books/31 { "isPublished": true }`.
- ჩაშენებული წიგნების შეცვლა/წაშლა → `403 SYSTEM_RESOURCE`.

#### PUT /api/books/{id}/pdf 🛡

`multipart/form-data`, ველი `file` (მაქს. 30 MB, მხოლოდ ნამდვილი PDF — მოწმდება ფაილის პირველი ბაიტები `%PDF-`).

```json
{ "pages": 128, "previewPages": 13, "size": 1048576, "previewUrl": "https://…/files/previews/….pdf", "previewGenerated": true }
```

სერვერი თავად ითვლის გვერდებს და ქმნის ფრაგმენტს (~10%, 3–15 გვერდი). შეცდომები: `400 FILE_REQUIRED`, `413 FILE_TOO_LARGE`, `415 INVALID_PDF`, `413 STORAGE_QUOTA_EXCEEDED` (sandbox-ზე 200 MB).

#### PUT /api/books/{id}/cover 🛡

`multipart/form-data`, ველი `file` (JPG/PNG/WEBP, მაქს. 3 MB, რეკომენდებული პროპორცია 2:3) → `{ "coverUrl": "…" }`. ყდის გარეშე წიგნს ავტომატურად დაგენერირებული ყდა აქვს; `DELETE /api/books/{id}/cover` მას დააბრუნებს.

---

### ⭐ Reviews — შეფასებები

| მეთოდი | URL | | აღწერა |
|---|---|---|---|
| GET | `/api/books/{bookId}/reviews` | 🔓 | შეფასებები: `page`, `pageSize` (≤50), `sort` = `newest` \| `highest` \| `lowest`, `mine=true` — მხოლოდ ჩემი |
| POST | `/api/books/{bookId}/reviews` | 🔒 | შეფასების დამატება |
| PUT | `/api/reviews/{id}` | 🔒 | საკუთარი შეფასების შეცვლა |
| DELETE | `/api/reviews/{id}` | 🔒 | წაშლა (ავტორი ან ადმინი) · `204` |

```json
{ "rating": 5, "comment": "შესანიშნავი წიგნია!" }
```

`rating` — სავალდებულო, 1–5 · `comment` — არასავალდებულო, ≤ 1000.

```json
{
  "id": 38, "bookId": 12, "rating": 5, "comment": "შესანიშნავი წიგნია!",
  "createdAt": "2026-10-15T00:27:54.330Z", "updatedAt": "2026-10-15T00:27:54.330Z",
  "user": { "id": 45, "name": "Nino B.", "avatarUrl": null },
  "isMine": true
}
```

ერთ წიგნს ერთი მომხმარებელი ერთხელ აფასებს → მეორედ `409 ALREADY_REVIEWED` (გამოიყენეთ `PUT`). სხვისი შეფასება → `403 NOT_YOUR_REVIEW`. ახალი შეფასება მაშინვე აისახება წიგნის `rating`-სა და `ratingBreakdown`-ში.

---

### 🔖 Library — ჩემი ბიბლიოთეკა

| მეთოდი | URL | | აღწერა |
|---|---|---|---|
| GET | `/api/library/favorites` | 🔒 | რჩეული წიგნები (`BookSummary[]`) |
| POST | `/api/library/favorites/{bookId}` | 🔒 | რჩეულებში დამატება — `{ "bookId": 12, "isFavorite": true }` |
| DELETE | `/api/library/favorites/{bookId}` | 🔒 | ამოღება — `{ "bookId": 12, "isFavorite": false }` |
| GET | `/api/library/progress` | 🔒 | „ვკითხულობ“ და წაკითხული: `?status=reading` \| `finished` |
| PUT | `/api/library/progress/{bookId}` | 🔒 💳 | პროგრესის შენახვა |
| DELETE | `/api/library/progress/{bookId}` | 🔒 | კითხვის ისტორიიდან ამოღება · `204` |
| GET | `/api/library/stats` | 🔒 | სტატისტიკა + ბოლო 84 დღის აქტივობა |

> რჩეულებში დამატება/ამოღება **იდემპოტენტურია**: ორჯერ გამოძახებაც უსაფრთხოა.

#### PUT /api/library/progress/{bookId}

```json
{ "currentPage": 42 }
```

```json
{ "currentPage": 42, "totalPages": 452, "percent": 9, "status": "reading",
  "startedAt": "2026-10-15T00:27:54.283Z", "lastReadAt": "2026-10-15T00:27:54.283Z", "finishedAt": null }
```

- `currentPage` — 1-დან წიგნის გვერდების რაოდენობამდე. ბოლო გვერდზე `status` ხდება `finished`.
- იგივე წვდომის წესები, რაც კითხვაზე (`402` გამოწერის გარეშე).
- 💡 **ნუ გაგზავნით ყოველ გვერდზე** — გამოიყენეთ debounce (~1 წამი), როცა მომხმარებელი გვერდს აღარ ფურცლავს.

#### GET /api/library/progress

```json
[
  {
    "book": { "id": 12, "title": "Pride and Prejudice", "...": "…" },
    "progress": { "currentPage": 42, "totalPages": 452, "percent": 9, "status": "reading", "...": "…" }
  }
]
```

#### GET /api/library/stats

```json
{
  "booksStarted": 5, "booksFinished": 0, "pagesRead": 216, "favorites": 3,
  "currentStreak": 0, "longestStreak": 5,
  "activity": [ { "date": "2026-07-24", "pages": 0 }, { "date": "2026-07-25", "pages": 12 } ]
}
```

`activity` — ზუსტად 84 დღე (12 კვირა), ძველიდან ახლისკენ — GitHub-ის სტილის „კალენდრისთვის“ (7 მწკრივი × 12 სვეტი).

---

### 💳 Plans & Subscription — გამოწერა

| მეთოდი | URL | | აღწერა |
|---|---|---|---|
| GET | `/api/plans` | 🔓 | გეგმები |
| GET | `/api/plans/{idOrCode}` | 🔓 | ერთი გეგმა (`1` ან `monthly`) |
| GET | `/api/subscription` | 🔒 | ჩემი გამოწერა (ყოველთვის 200, გამოწერის გარეშე `status: "none"`) |
| POST | `/api/subscription/trial` | 🔒 | 7-დღიანი უფასო საცდელის დაწყება (ბარათის გარეშე) |
| POST | `/api/subscription/checkout` | 🔒 | გადახდა სატესტო ბარათით |
| POST | `/api/subscription/cancel` | 🔒 | გაუქმება (პერიოდის ბოლოს) |
| POST | `/api/subscription/resume` | 🔒 | გაუქმებულის აღდგენა |
| PUT | `/api/subscription/plan` | 🔒 | გეგმის შეცვლა |
| PUT | `/api/subscription/payment-method` | 🔒 | ბარათის შენახვა/შეცვლა |

#### GET /api/plans

```json
[
  {
    "id": 1, "code": "monthly", "name": "თვიური",
    "description": "მთელი ბიბლიოთეკა ნებისმიერ მოწყობილობაზე. გააუქმე როცა გინდა.",
    "price": 12.99, "currency": "GEL", "interval": "month", "trialDays": 7,
    "allowDownload": false, "isPopular": false, "monthlyPrice": 12.99,
    "features": ["ბიბლიოთეკის ყველა წიგნი", "კითხვა ბრაუზერში, ნებისმიერ მოწყობილობაზე", "…"]
  },
  {
    "id": 2, "code": "annual", "name": "წლიური",
    "description": "ორი თვე საჩუქრად და წიგნების ჩამოტვირთვა ოფლაინ კითხვისთვის.",
    "price": 129, "currency": "GEL", "interval": "year", "trialDays": 7,
    "allowDownload": true, "isPopular": true, "monthlyPrice": 10.75,
    "features": ["ყველაფერი, რაც თვიურ გეგმაშია", "PDF-ების ჩამოტვირთვა", "…"]
  }
]
```

#### გამოწერის მდგომარეობები (state machine)

```
                 POST /trial                     საცდელი მთავრდება
   ┌──────┐  ──────────────►  ┌──────────┐  ───────── ბარათი არ არის ─────────►  ┌─────────┐
   │ none │                   │ trialing │                                        │ expired │
   └──────┘                   └──────────┘  ── ბარათი შენახულია → ჩამოჭრა ──┐     └─────────┘
      │                         │  │ POST /checkout (დარჩენილი დღეები რჩება)   │        ▲  │
      │ POST /checkout          │  ▼                                           ▼        │  │
      └──────────────────────►  ┌────────┐  ◄────────────────────────────────────────┘  │  │
                                │ active │  ── პერიოდის ბოლოს: ავტო-განახლება ──┐      │  │
                                └────────┘  ◄───────── წარმატება ───────────────┘      │  │
                                  │    ▲     ── ბარათი უარყოფილია ─────────────────────┘  │
                       POST       │    │ POST /resume                                     │
                       /cancel    ▼    │                                                  │
                                ┌──────────┐  ── პერიოდი მთავრდება ──────────────────────┘
                                │ canceled │                    expired → POST /checkout → active
                                └──────────┘
```

| `status` | `hasAccess` | ნიშნავს | რეკომენდებული UI |
|---|---|---|---|
| `none` | ❌ | ჯერ არასოდეს გამოუწერია | „დაიწყე 7 დღე უფასოდ“ (თუ `canStartTrial`) |
| `trialing` | ✅ | საცდელი პერიოდი | „დარჩა X დღე“ + „გამოწერა“ / „ბარათის დამატება“ |
| `active` | ✅ | ფასიანი, აქტიური | „განახლდება {renewsAt}“ + „გაუქმება“, „გეგმის შეცვლა“ |
| `canceled` | ✅ (`accessUntil`-მდე) | გაუქმებულია, მაგრამ პერიოდი ჯერ არ დასრულებულა | „წვდომა გაქვთ {date}-მდე“ + „აღდგენა“ |
| `expired` | ❌ | დასრულდა | „განაახლეთ გამოწერა“ |

#### GET /api/subscription

```json
{
  "status": "active",
  "plan": { "id": 2, "code": "annual", "name": "წლიური", "price": 129, "currency": "GEL", "interval": "year", "...": "…" },
  "isTrial": false,
  "isComplimentary": false,
  "hasAccess": true,
  "canDownload": true,
  "canStartTrial": false,
  "hasUsedTrial": true,
  "startedAt": "2026-10-15T00:27:54.241Z",
  "currentPeriodStart": "2026-10-15T00:27:54.472Z",
  "currentPeriodEnd": "2027-10-22T00:27:54.241Z",
  "trialEndsAt": "2026-10-22T00:27:54.241Z",
  "cancelAtPeriodEnd": false,
  "canceledAt": null,
  "endedAt": null,
  "accessUntil": "2027-10-22T00:27:54.241Z",
  "renewsAt": "2027-10-22T00:27:54.241Z",
  "daysLeft": 372,
  "paymentMethod": { "brand": "visa", "last4": "4242", "expMonth": 12, "expYear": 2030, "holderName": "Nino Beridze" },
  "now": "2026-10-15T00:27:54.510Z"
}
```

| ველი | აღწერა |
|---|---|
| `hasAccess` | შეუძლია თუ არა ახლა სრული წიგნების კითხვა |
| `canStartTrial` | შეუძლია თუ არა საცდელის დაწყება (ერთხელ, პირველ გამოწერამდე) |
| `accessUntil` | წვდომა ამ თარიღამდე (ან `null`) |
| `renewsAt` | როდის ჩამოიჭრება შემდეგი გადახდა (`null`, თუ არ განახლდება) |
| `daysLeft` | დარჩენილი დღეები (მომრგვალებული ზემოთ) |
| `now` | „ახლა“ ამ მომხმარებლისთვის (განსხვავდება რეალური დროისგან time-travel-ის შემდეგ) |

#### POST /api/subscription/trial

```json
{ "planId": 1 }
```

`200` → `SubscriptionDto` (`status: "trialing"`, `isTrial: true`, `accessUntil` = +7 დღე) + წერილი ინბოქსში.

| შეცდომა | როდის |
|---|---|
| `403 EMAIL_NOT_VERIFIED` | ელ-ფოსტა არ არის დადასტურებული |
| `409 TRIAL_ALREADY_USED` | საცდელი უკვე გამოიყენა (ან უკვე გადაიხადა ოდესმე) |
| `409 ALREADY_SUBSCRIBED` | უკვე აქვს მოქმედი გამოწერა/საცდელი |
| `404 PLAN_NOT_FOUND` | ასეთი გეგმა არ არის |

> საცდელი პერიოდი ბარათს არ ითხოვს. თუ ბოლომდე არაფერს გააკეთებს — წვდომა უბრალოდ დასრულდება (`expired`). თუ საცდელის დროს ბარათს შეინახავს (`PUT /payment-method`), საცდელის ბოლოს ავტომატურად ჩამოიჭრება და გამოწერა გააქტიურდება.

#### POST /api/subscription/checkout

```json
{
  "planId": 2,
  "card": {
    "number": "4242 4242 4242 4242",
    "holderName": "Nino Beridze",
    "expMonth": 12,
    "expYear": 2030,
    "cvc": "123"
  }
}
```

**პასუხი `200`:**

```json
{
  "subscription": { "status": "active", "currentPeriodEnd": "2027-10-22T00:27:54.241Z", "...": "…" },
  "payment": {
    "id": 35, "invoiceNumber": "ANB-20261015-429EC115", "amount": 129, "currency": "GEL",
    "status": "succeeded", "kind": "subscription", "description": "წლიური — გამოწერა",
    "planCode": "annual", "planName": "წლიური", "failureCode": null, "failureMessage": null,
    "cardBrand": "visa", "cardLast4": "4242",
    "periodStart": "2026-10-15T00:27:54.472Z", "periodEnd": "2027-10-22T00:27:54.241Z",
    "createdAt": "2026-10-15T00:27:54.472Z"
  }
}
```

ვალიდაცია **სამ დონეზე** — ზუსტად ისე, როგორც ნამდვილ გადახდის სისტემებში:

1. **ფორმატი (400)** — ბარათის ნომერი (Luhn ალგორითმი), მფლობელი, ვადა (არა წარსულში), CVC (3 ციფრი, Amex-ზე 4). შეცდომები ჩადგმული ველებით: `errors["card.number"]`, `errors["card.expYear"]`...
2. **სატესტო ბარათი (402 `TEST_CARD_REQUIRED`)** — ნამდვილი ბარათის ნომერი არ მიიღება. **ნამდვილი ბარათის მონაცემები არასოდეს შეიყვანოთ!**
3. **„ბანკის“ პასუხი (402)** — `CARD_DECLINED`, `INSUFFICIENT_FUNDS`, `EXPIRED_CARD`, `INCORRECT_CVC`, `PROCESSING_ERROR` (იხ. [სატესტო ბარათები](#6-სატესტო-ბარათები)). უარყოფილი მცდელობაც ინახება გადახდების ისტორიაში (`status: "failed"`), პასუხში კი მოდის `paymentId`.

**წესები:**

- საჭიროა დადასტურებული ელ-ფოსტა (`403 EMAIL_NOT_VERIFIED`).
- `active`/`canceled` სტატუსზე → `409 ALREADY_SUBSCRIBED` (გამოიყენეთ `resume` ან `PUT /plan`).
- **საცდელის დროს გადახდისას დარჩენილი დღეები არ იკარგება:** პირველი ფასიანი პერიოდი საცდელის ბოლოდან იწყება (ზემოთ მაგალითში — 22.10.2026-დან 22.10.2027-მდე).
- ბარათიდან ვინახავთ მხოლოდ ბრენდს და ბოლო 4 ციფრს — **არასოდეს** სრულ ნომერს და CVC-ს.

#### POST /api/subscription/cancel · POST /api/subscription/resume

ორივე → `SubscriptionDto`.

- `cancel`: `status → canceled`, `cancelAtPeriodEnd: true`, `renewsAt: null`. წვდომა რჩება `accessUntil`-მდე. ფული არ ბრუნდება. `409 NOTHING_TO_CANCEL`, თუ გასაუქმებელი არაფერია.
- `resume`: მხოლოდ `canceled` სტატუსზე, სანამ პერიოდი არ დასრულებულა → ისევ `active` (ან `trialing`). სხვა შემთხვევაში `409 CANNOT_RESUME`.

#### PUT /api/subscription/plan

```json
{ "planId": 1 }
```

`200` → `{ subscription, payment }`. მხოლოდ აქტიურ ფასიან გამოწერაზე (`409 NOT_ACTIVE`). შენახული ბარათიდან **ახლავე** ჩამოიჭრება ახალი გეგმის სრული ფასი და ახალი პერიოდი დღეიდან იწყება (პროპორციული გადაანგარიშება ამ API-ში არ არის). `409 SAME_PLAN`, `409 NO_PAYMENT_METHOD`, `402` ბარათის შეცდომები.

#### PUT /api/subscription/payment-method

```json
{ "card": { "number": "5555 5555 5555 4444", "holderName": "Nino Beridze", "expMonth": 6, "expYear": 2031, "cvc": "321" } }
```

`200` → `SubscriptionDto` (ახალი `paymentMethod`). სრულდება „0 ლარიანი ავტორიზაცია“ — უარყოფილი ბარათი → `402`. საცდელ პერიოდში ეს ნიშნავს „საცდელის ბოლოს ჩამომაჭერით და გააგრძელეთ“. `409 NOT_ACTIVE`, თუ გამოწერა არ გაქვთ.

---

### 🧾 Payments — გადახდები

| მეთოდი | URL | | აღწერა |
|---|---|---|---|
| GET | `/api/payments` | 🔒 | ჩემი გადახდები, ახლიდან ძველისკენ (`page`, `pageSize` ≤ 50) |
| GET | `/api/payments/{id}` | 🔒 | ერთი გადახდა (ქვითარი) |

```json
{
  "items": [
    {
      "id": 37, "invoiceNumber": "ANB-20261015-1A2B3C4D", "amount": 12.99, "currency": "GEL",
      "status": "succeeded", "kind": "planChange", "description": "გეგმის შეცვლა: თვიური",
      "planCode": "monthly", "planName": "თვიური", "failureCode": null, "failureMessage": null,
      "cardBrand": "visa", "cardLast4": "4242",
      "periodStart": "2026-10-15T00:27:54.6Z", "periodEnd": "2026-11-15T00:27:54.6Z",
      "createdAt": "2026-10-15T00:27:54.6Z"
    },
    {
      "id": 34, "invoiceNumber": "ANB-20261015-9F8E7D6C", "amount": 129, "currency": "GEL",
      "status": "failed", "kind": "subscription", "description": "წლიური — გამოწერა",
      "failureCode": "CARD_DECLINED", "failureMessage": "ბანკმა ბარათი უარყო.",
      "cardBrand": "visa", "cardLast4": "0002", "periodStart": null, "periodEnd": null,
      "createdAt": "2026-10-15T00:27:54.4Z"
    }
  ],
  "page": 1, "pageSize": 10, "totalItems": 2, "totalPages": 1, "hasMore": false
}
```

`kind`: `subscription` (პირველი გადახდა), `renewal` (ავტომატური განახლება), `planChange`, `complimentary` (ადმინის მიერ მინიჭებული, 0 ₾). `status`: `succeeded` \| `failed`.

---

### 🛠 Admin — ადმინ-პანელი

ყველა 🛡 — საჭიროა `admin` როლი (სხვა შემთხვევაში `403 ADMIN_ONLY`). როლი ყოველ მოთხოვნაზე ბაზიდან მოწმდება, ამიტომ როლის მოხსნა მაშინვე მოქმედებს (და არა ტოკენის ვადის გასვლისას).

| მეთოდი | URL | აღწერა |
|---|---|---|
| GET | `/api/admin/stats` | დაფის მაჩვენებლები + ბოლო 14 დღის გრაფიკები |
| GET | `/api/admin/users` | მომხმარებლები: `q`, `role` (`user`\|`admin`), `status` (`none`\|`trialing`\|`active`\|`canceled`\|`expired`), `page`, `pageSize` ≤ 100 |
| GET | `/api/admin/users/{id}` | ერთი მომხმარებელი |
| PUT | `/api/admin/users/{id}/role` | `{ "role": "admin" }` ან `"user"` |
| POST | `/api/admin/users/{id}/grant` | უფასო წვდომა: `{ "planId": 2, "days": 30 }` (1–365) |
| DELETE | `/api/admin/users/{id}` | მომხმარებლის წაშლა · `204` |
| GET | `/api/admin/payments` | ყველა გადახდა: `status` (`succeeded`\|`failed`), `page`, `pageSize` |

წიგნები და კატეგორიები იმართება `/api/books`-ით და `/api/categories`-ით (იხ. ზემოთ). draft-ების სანახავად: `GET /api/books?includeDrafts=true`.

#### GET /api/admin/stats

```json
{
  "users": { "total": 41, "verified": 38, "admins": 1, "newLast7Days": 9 },
  "subscriptions": { "none": 12, "trialing": 1, "active": 16, "canceled": 1, "expired": 11 },
  "revenue": { "currency": "GEL", "total": 968.85, "last30Days": 658.89, "mrr": 196.64, "failedPayments": 4 },
  "books": { "total": 30, "published": 30, "drafts": 0, "custom": 0 },
  "reading": { "activeReaders7d": 32, "pagesRead30d": 7269, "reviews": 37 },
  "signups": [ { "date": "2026-10-02", "value": 0 }, { "date": "2026-10-03", "value": 1 } ],
  "revenueByDay": [ { "date": "2026-10-02", "value": 0 }, { "date": "2026-10-03", "value": 129 } ],
  "topBooks": [ { "id": 12, "title": "Pride and Prejudice", "author": "Jane Austen", "coverUrl": "…", "readers": 8900 } ]
}
```

**MRR** (Monthly Recurring Revenue) — თვიური განმეორებადი შემოსავალი: აქტიური ფასიანი გამოწერების თვიური ღირებულება (წლიური ÷ 12).

#### GET /api/admin/users

```json
{
  "items": [
    {
      "id": 7, "firstName": "ნინო", "lastName": "ლომიძე", "email": "nino.k42@example.com", "role": "user",
      "isVerified": true, "avatarUrl": null, "createdAt": "2026-09-12T08:14:00Z", "lastLoginAt": "2026-10-13T18:02:00Z",
      "subscription": { "status": "active", "planCode": "monthly", "isTrial": false, "hasAccess": true, "accessUntil": "2026-11-12T08:14:00Z" },
      "booksStarted": 3, "totalSpent": 25.98, "isDemoAccount": false
    }
  ],
  "page": 1, "pageSize": 20, "totalItems": 41, "totalPages": 3, "hasMore": true
}
```

შეზღუდვები: საკუთარ თავზე (`409 CANNOT_CHANGE_SELF`), სადემონსტრაციო ანგარიშებზე (`403 DEMO_ACCOUNT_LOCKED`).

---

### 🧪 Sandbox — სასწავლო ინსტრუმენტები

> ⚠️ ასეთი ენდპოინტები **რეალურ API-ს არ აქვს** — ისინი იმისთვისაა, რომ სწავლისას ყველა სცენარი შეამოწმოთ.

| მეთოდი | URL | | აღწერა |
|---|---|---|---|
| GET | `/api/sandbox/inbox?email=…` | 🔓 | API-ის მიერ „გაგზავნილი“ წერილები (ტოკენით — email შეგიძლიათ არ მიუთითოთ) |
| DELETE | `/api/sandbox/inbox?email=…` | 🔓 | ინბოქსის გასუფთავება · `204` |
| GET | `/api/sandbox/test-cards` | 🔓 | სატესტო ბარათების სია |
| GET | `/api/sandbox/clock` | 🔒 | რეალური დრო და მომხმარებლის „დრო“ |
| POST | `/api/sandbox/time-travel` | 🔒 | მომხმარებლის საათის წინ გადაწევა: `{ "days": 8 }` (1–400) |
| POST | `/api/sandbox/reset-subscription` | 🔒 | გამოწერის, გადახდების და საცდელის „დავიწყება“ + საათის დაბრუნება |

#### GET /api/sandbox/inbox

```json
{
  "items": [
    {
      "id": 51, "to": "nino@example.com", "subject": "დაადასტურეთ ელ-ფოსტა — კოდი 701034", "type": "verify_email",
      "code": "701034", "preview": "გამარჯობა, Nino! ანბანზე ელ-ფოსტის დასადასტურებლად გამოიყენეთ ეს კოდი: 701034 …",
      "text": "…", "html": "<div style=…>…</div>", "createdAt": "2026-10-15T00:27:53.6Z"
    }
  ],
  "page": 1, "pageSize": 20, "totalItems": 1, "totalPages": 1, "hasMore": false
}
```

წერილის ტიპები (`type`): `verify_email`, `password_reset`, `welcome`, `trial_started`, `receipt`, `payment_failed`, `subscription_canceled`, `subscription_expired`. `code` — მხოლოდ კოდიან წერილებზე.

> 💡 `html` ველი რომ აჩვენოთ, გამოიყენეთ `<iframe sandbox srcdoc="...">` — **არასოდეს** `innerHTML`.

#### POST /api/sandbox/time-travel

```json
{ "days": 8 }
```

```json
{ "serverTime": "2026-10-15T00:27:54.6Z", "userTime": "2026-10-23T00:27:54.6Z", "offsetDays": 8 }
```

მომხმარებლის საათი წინ მიდის **მხოლოდ მისთვის**: ყველა თარიღი (საცდელის ვადა, განახლებები, ქვითრები, კითხვის აქტივობა) ამ „დროით“ ითვლება. შემდეგი მოთხოვნისას API თავად ასრულებს ყველაფერს, რაც ამ პერიოდში უნდა მომხდარიყო: საცდელის დასრულებას, ავტომატურ განახლებებს (ყოველ თვეს/წელს — ახალი ქვითარი), წარუმატებელ ჩამოჭრას.

| გადაწევა | რა ვნახოთ |
|---|---|
| +8 დღე საცდელზე | `trialing` → `expired`, წერილი „საცდელი დასრულდა“ |
| +8 დღე საცდელზე, ბარათით | `trialing` → `active`, ქვითარი |
| +31 დღე თვიურზე | ავტომატური განახლება, ახალი ქვითარი |
| +31 დღე ბარათით `4000 0000 0000 0341` | განახლება ვერ ხერხდება → `expired`, წერილი „გადახდა ვერ შესრულდა“ |
| +N დღე `canceled`-ზე | პერიოდის ბოლოს → `expired` |

`POST /api/sandbox/reset-subscription` → `SubscriptionDto` (`status: "none"`, `canStartTrial: true`) — თავიდან რომ სცადოთ.

---

## 5. ბიზნეს-წესები

**ანგარიში**
1. ელ-ფოსტა sandbox-ში უნიკალურია (რეგისტრი არ აქვს მნიშვნელობა: `Nino@Mail.ge` = `nino@mail.ge`).
2. პაროლი: ≥ 8 სიმბოლო, ასო + ციფრი.
3. დადასტურების/აღდგენის კოდი: 6 ციფრი, 15 წუთი, 5 ცდა. ახალი კოდის გაგზავნისას ძველი უქმდება. თავიდან გაგზავნა — 60 წამში ერთხელ.
4. sandbox-ის პირველი მომხმარებელი — `admin`.

**წვდომა**
5. კატალოგი, დეტალები, ფრაგმენტები, შეფასებები — ყველასთვის ღიაა.
6. სრული წიგნი: შესული მომხმარებელი **და** (უფასო წიგნი **ან** `hasAccess`). ადმინს გამოწერის გარეშე მხოლოდ საკუთარი ატვირთული წიგნები ეხსნება.
7. ჩამოტვირთვა: უფასო წიგნები — ყველა შესულს; დანარჩენი — მხოლოდ **ფასიანი წლიური** გეგმით (არა საცდელში, არა თვიურზე).
8. პროგრესის შენახვაც კითხვად ითვლება — იგივე წესები (`402`).

**გამოწერა**
9. საცდელი პერიოდი: 7 დღე, ბარათის გარეშე, **ერთხელ ანგარიშზე, პირველ გადახდამდე**; საჭიროა დადასტურებული ელ-ფოსტა.
10. საცდელის დროს გადახდისას დარჩენილი საცდელი დღეები ემატება პირველ პერიოდს.
11. საცდელის ბოლოს: ბარათი შენახულია და არ არის გაუქმებული → ჩამოიჭრება და `active`; სხვა შემთხვევაში → `expired`.
12. ფასიანი პერიოდის ბოლოს: ავტომატური განახლება შენახული ბარათით; უარყოფისას → `expired` (+ წარუმატებელი გადახდა ისტორიაში).
13. გაუქმება მოქმედებს პერიოდის ბოლოს; მანამდე `resume` შესაძლებელია. თანხა არ ბრუნდება.
14. გეგმის შეცვლა: მხოლოდ აქტიურ ფასიან გამოწერაზე, სრული ფასით, ახალი პერიოდი დღეიდან.
15. ადმინის მიერ მინიჭებული წვდომა (`isComplimentary`) არ ახლდება — ვადის ბოლოს `expired`.

**შინაარსი**
16. ჩაშენებული წიგნები/კატეგორიები მხოლოდ საკითხავადაა (`SYSTEM_RESOURCE`).
17. ახალი წიგნი — draft; გამოქვეყნება მხოლოდ PDF-ის შემდეგ.
18. კატეგორიის წაშლა — მხოლოდ ცარიელის.
19. ერთი შეფასება ერთ წიგნზე ერთ მომხმარებელზე.
20. sandbox-ის ფაილების ლიმიტი — 200 MB; PDF ≤ 30 MB; სურათი ≤ 3 MB.

**ლიმიტები**
21. 300 მოთხოვნა წუთში ერთ API გასაღებზე; auth — 30 წუთში; გასაღების შექმნა — 10 საათში ერთი IP-დან. გადაჭარბებისას `429` + `Retry-After`.

---

## 6. სატესტო ბარათები

ვადა — ნებისმიერი **მომავალი** თარიღი, CVC — ნებისმიერი 3 ციფრი, მფლობელი — ნებისმიერი სახელი.

| ბარათი | ბრენდი | შედეგი |
|---|---|---|
| `4242 4242 4242 4242` | Visa | ✅ წარმატებული გადახდა |
| `5555 5555 5555 4444` | Mastercard | ✅ წარმატებული გადახდა |
| `4000 0000 0000 0002` | Visa | ❌ `402 CARD_DECLINED` |
| `4000 0000 0000 9995` | Visa | ❌ `402 INSUFFICIENT_FUNDS` |
| `4000 0000 0000 0069` | Visa | ❌ `402 EXPIRED_CARD` |
| `4000 0000 0000 0127` | Visa | ❌ `402 INCORRECT_CVC` |
| `4000 0000 0000 0119` | Visa | ❌ `402 PROCESSING_ERROR` |
| `4000 0000 0000 0341` | Visa | ✅ ახლა იხდის, ❌ ავტომატური განახლებისას უარყოფს |
| ნებისმიერი სხვა (ვალიდური) ნომერი | — | ❌ `402 TEST_CARD_REQUIRED` |

იგივე სია API-დან: `GET /api/sandbox/test-cards`.

---

## 7. სცენარები ნაბიჯ-ნაბიჯ

### 7.1 სტუმრიდან მკითხველამდე

| # | მოქმედება | მოთხოვნა | შედეგი |
|---|---|---|---|
| 1 | ხედავს კატალოგს | `GET /api/books` | `isFavorite: null` (სტუმარი) |
| 2 | ხსნის წიგნს | `GET /api/books/12` | `access.reason: "loginRequired"` |
| 3 | კითხულობს ფრაგმენტს | `previewUrl` → PDF.js | ავტორიზაციის გარეშე |
| 4 | რეგისტრირდება | `POST /api/auth/register` | `201`, `isVerified: false` |
| 5 | ცდილობს საცდელს | `POST /api/subscription/trial` | `403 EMAIL_NOT_VERIFIED` |
| 6 | შეაქვს კოდი | `GET /api/sandbox/inbox` → `POST /api/auth/verify-email` | `200`, ახალი ტოკენები |
| 7 | იწყებს საცდელს | `POST /api/subscription/trial` | `trialing`, 7 დღე |
| 8 | კითხულობს | `GET /api/books/12/read` → `url` → PDF.js | `200` |
| 9 | ფურცლავს | `PUT /api/library/progress/12 { currentPage }` | `progress.percent` |
| 10 | იხდის | `POST /api/subscription/checkout` | `active`, ქვითარი |

### 7.2 „რა ხდება, როცა საცდელი იწურება?“

1. `POST /api/subscription/trial` → `trialing`
2. `POST /api/sandbox/time-travel { "days": 8 }`
3. `GET /api/subscription` → `status: "expired"`, `hasAccess: false`, `canStartTrial: false`
4. `GET /api/books/12/read` → `402 SUBSCRIPTION_REQUIRED` → UI აჩვენებს paywall-ს
5. ინბოქსში: „უფასო საცდელი პერიოდი დასრულდა“

### 7.3 განახლება ვერ მოხერხდა

1. `POST /api/subscription/checkout` ბარათით `4000 0000 0000 0341` → `active` (თვიური)
2. `POST /api/sandbox/time-travel { "days": 31 }`
3. `GET /api/subscription` → `expired`; `GET /api/payments` → ბოლო ჩანაწერი `failed`, `CARD_DECLINED`
4. ინბოქსში: „გადახდა ვერ შესრულდა“

### 7.4 ადმინი ამატებს წიგნს

1. `POST /api/categories { "name": "პროგრამირება" }` → `201`
2. `POST /api/books { ... }` → `201`, `isPublished: false`
3. `PUT /api/books/{id} { "isPublished": true }` → `409 PDF_REQUIRED`
4. `PUT /api/books/{id}/pdf` (`multipart/form-data`) → `{ pages, previewPages }`
5. `PUT /api/books/{id}/cover` (არასავალდებულო)
6. `PUT /api/books/{id} { "isPublished": true }` → წიგნი კატალოგში ჩანს

---

## 8. რეკომენდაციები და ხშირი შეცდომები

**სანამ კოდს დაწერთ**
1. ჯერ გაიარეთ სცენარი **Swagger-ში** (`/swagger` → „Authorize“ → ჩასვით `X-API-KEY` და `Bearer` ტოკენი) ან **Postman-ში** — დარწმუნდით, რას აბრუნებს API, შემდეგ დაწერეთ UI.
2. გახსენით სადემონსტრაციო საიტი (`/app`) და მარჯვენა ქვედა კუთხეში **„API“ პანელი** — იქ ჩანს ყოველი მოთხოვნა, რასაც საიტი აგზავნის, პასუხითურთ.

**ხშირი შეცდომები**

| სიმპტომი | მიზეზი | გამოსწორება |
|---|---|---|
| `401 API_KEY_MISSING` ყველაფერზე | `X-API-KEY` არ იგზავნება | დაამატეთ ერთ ადგილას — interceptor-ში |
| ყოველ 15 წუთში „გამოგდებს“ | refresh არ არის რეალიზებული | იხ. [1.4](#14-რეკომენდებული-კოდი-interceptor) |
| refresh-ის შემდეგ მაინც 401 | ძველ refresh token-ს იყენებთ | ყოველ refresh-ზე შეინახეთ **ახალი** `refreshToken` |
| რამდენიმე ერთდროული refresh, მერე `INVALID_REFRESH_TOKEN` | ყველა ჩავარდნილი მოთხოვნა ცალკე აკეთებს refresh-ს | ერთი საერთო Promise (`refreshing ??= ...`) |
| `400 INVALID_JSON` | სხეული JSON არ არის ან ტიპი არასწორია (`"planId": "2"` სტრიქონად) | `JSON.stringify(body)` + `Content-Type: application/json`, რიცხვები — რიცხვად |
| ფაილის ატვირთვა: `FILE_REQUIRED` | ველის სახელი არ არის `file`, ან `Content-Type` ხელით დააყენეთ | `form.append('file', f)`, Content-Type — არ დააყენოთ |
| `res.json()` ჩავარდა 204-ზე | 204-ს სხეული არ აქვს | შეამოწმეთ `res.status === 204` |
| PDF `<iframe>`-ში არ იხსნება | Bearer ტოკენით ცდილობთ `/files/...`-ს | გამოიყენეთ `/read`-ის `url` |
| თარიღი 4 საათით სცდება | UTC სტრიქონს ხელით ჭრით | `new Date(value)` + `Intl.DateTimeFormat` |
| `422`-ს ელოდებით | ამ API-ში ვალიდაცია = `400` | იხ. [3.2](#32-სტატუს-კოდები--და-რა-უნდა-გააკეთოს-ui-მ) |

**კარგი პრაქტიკა**
- შეცდომას ამოწმებთ `code`-ით, მომხმარებელს აჩვენებთ `detail`-ს, ველის შეცდომებს — `errors`-დან.
- ყოველ სიას სჭირდება 4 მდგომარეობა: **იტვირთება** (skeleton), **ცარიელი**, **შეცდომა** (თავიდან ცდით), **მონაცემები**.
- ღილაკი მოთხოვნის დროს — `disabled` + loader (ორმაგი გადახდა რომ არ მოხდეს!).
- API გასაღები `.env`-ში; ტოკენები — `localStorage`-ში (ან მეხსიერებაში + refresh). XSS-ისგან დაცვისთვის API-დან მიღებული ტექსტი არასოდეს ჩასვათ `innerHTML`-ით.
- `Accept-Language` შეუსაბამეთ UI-ის ენას — მაშინ შეცდომებიც და კატეგორიებიც თარგმნილი მოვა.

---

## 9. შეცდომის კოდების სრული სია

| კოდი | სტატუსი | მნიშვნელობა |
|---|---|---|
| `VALIDATION_ERROR` | 400 | ველები არასწორადაა შევსებული (`errors`) |
| `INVALID_JSON` | 400 | სხეული/პარამეტრი არასწორი ფორმატისაა |
| `INVALID_CODE` | 400 | დადასტურების/აღდგენის კოდი არასწორია (`attemptsLeft`) |
| `CODE_EXPIRED` | 400 | კოდს ვადა გაუვიდა |
| `WRONG_PASSWORD` | 400 | მიმდინარე პაროლი არასწორია |
| `FILE_REQUIRED` | 400 | ფაილი არ არის გამოგზავნილი |
| `API_KEY_MISSING` | 401 | `X-API-KEY` არ არის |
| `API_KEY_INVALID` | 401 | გასაღები არასწორია |
| `AUTH_REQUIRED` | 401 | ტოკენი საჭიროა |
| `TOKEN_EXPIRED` | 401 | access token-ს ვადა გაუვიდა → refresh |
| `TOKEN_INVALID` | 401 | ტოკენი დაზიანებულია/არასწორია |
| `TOKEN_WRONG_SANDBOX` | 401 | ტოკენი სხვა API გასაღებისაა |
| `USER_NOT_FOUND` | 401 | ანგარიში წაიშალა |
| `INVALID_CREDENTIALS` | 401 | ელ-ფოსტა ან პაროლი არასწორია |
| `INVALID_REFRESH_TOKEN` | 401 | refresh token არასწორი/ვადაგასული/გამოყენებულია |
| `SUBSCRIPTION_REQUIRED` | 402 | საჭიროა გამოწერა ან საცდელი |
| `TEST_CARD_REQUIRED` | 402 | მხოლოდ სატესტო ბარათები |
| `CARD_DECLINED` · `INSUFFICIENT_FUNDS` · `EXPIRED_CARD` · `INCORRECT_CVC` · `PROCESSING_ERROR` | 402 | ბარათი უარყოფილია (`paymentId`) |
| `API_KEY_DISABLED` | 403 | გასაღები გათიშულია |
| `EMAIL_NOT_VERIFIED` | 403 | ჯერ დაადასტურეთ ელ-ფოსტა |
| `DOWNLOAD_NOT_INCLUDED` | 403 | ჩამოტვირთვა არ შედის გეგმაში |
| `ADMIN_ONLY` | 403 | მხოლოდ ადმინისთვის |
| `SYSTEM_RESOURCE` | 403 | ჩაშენებული ჩანაწერი |
| `NOT_YOUR_REVIEW` | 403 | სხვისი შეფასება |
| `DEMO_ACCOUNT_LOCKED` | 403 | სადემონსტრაციო ანგარიში დაცულია |
| `LINK_EXPIRED` · `LINK_INVALID` | 403 | ფაილის ბმულს ვადა გაუვიდა / არასწორია |
| `SELF_SERVICE_DISABLED` | 403 | გასაღებს ლექტორი გასცემს |
| `NOT_FOUND` | 404 | ასეთი მისამართი არ არსებობს |
| `BOOK_NOT_FOUND` · `CATEGORY_NOT_FOUND` · `REVIEW_NOT_FOUND` · `PLAN_NOT_FOUND` · `PAYMENT_NOT_FOUND` | 404 | ჩანაწერი ვერ მოიძებნა |
| `METHOD_NOT_ALLOWED` | 405 | არასწორი HTTP მეთოდი |
| `EMAIL_TAKEN` | 409 | ელ-ფოსტა დაკავებულია |
| `ALREADY_VERIFIED` | 409 | უკვე დადასტურებულია |
| `TRIAL_ALREADY_USED` | 409 | საცდელი უკვე გამოყენებულია |
| `ALREADY_SUBSCRIBED` | 409 | უკვე გაქვთ გამოწერა |
| `NOTHING_TO_CANCEL` · `CANNOT_RESUME` · `NOT_ACTIVE` · `SAME_PLAN` · `NO_PAYMENT_METHOD` | 409 | გამოწერის მდგომარეობა ამას არ იძლევა |
| `ALREADY_REVIEWED` | 409 | უკვე შეაფასეთ |
| `CATEGORY_EXISTS` · `CATEGORY_NOT_EMPTY` | 409 | კატეგორიის კონფლიქტი |
| `PDF_REQUIRED` · `NO_PDF` | 409 | PDF არ არის |
| `LAST_ADMIN` · `CANNOT_CHANGE_SELF` | 409 | ადმინის შეზღუდვა |
| `FILE_TOO_LARGE` · `STORAGE_QUOTA_EXCEEDED` | 413 | ფაილი/ლიმიტი |
| `UNSUPPORTED_FILE_TYPE` · `INVALID_PDF` | 415 | ფაილის ტიპი |
| `RATE_LIMITED` · `TOO_MANY_ATTEMPTS` · `RESEND_TOO_SOON` | 429 | ძალიან ხშირი მოთხოვნები |
| `INTERNAL_ERROR` | 500 | სერვერის შეცდომა |

---

*ვერსია 1.0 · 2026 · ტექსტები — საზოგადოებრივი საკუთრება (Project Gutenberg, ვიკიწყარო) · STEP IT Academy*
