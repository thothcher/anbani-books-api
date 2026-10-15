<p align="center"><img src="web/assets/mark.svg" width="64" alt=""></p>

# Anbani — a digital library with subscriptions

**Anbani** („ანბანი“, *the alphabet*) is a fictional Georgian online library. Readers sign up, confirm their e-mail, start a 7-day free trial, read PDF books in the browser, and then pay for a monthly or annual plan.

It's a complete client project for STEP IT Academy front-end students, meant to replace the restaurant project every group has already built. Students don't write the backend. They get an API key, read the documentation, and build the website. The project includes the hard parts of a real product on purpose: access + refresh tokens, a subscription state machine, payments that fail, signed file links, an admin role, pagination, and errors with machine-readable codes.

| What students get | Where |
|---|---|
| A live API with their own sandbox | `/` developer portal → their `X-API-KEY` |
| Documentation in Georgian, with real requests and responses | `/docs` ([docs/api.ka.md](docs/api.ka.md)) |
| The brief: client story, personas, user stories, UI states, 4 sprints, rubric | `/docs.html?doc=brief` ([docs/brief.ka.md](docs/brief.ka.md)) |
| Swagger UI and a Postman collection that stores tokens automatically | `/swagger`, [docs/postman](docs/postman) |
| A reference website to compare against, with an "API X-ray" panel | `/app` |
| Brand assets (logo, colours, type) | `/brand.html` |

## Run it locally

You need the [.NET 10 SDK](https://dotnet.microsoft.com/download).

```bash
dotnet run --project src/BooksApi
```

Open <http://localhost:5080>. The SQLite database, demo data and a JWT secret are created on first start in `src/BooksApi/storage/`. Delete that folder to start over.

| URL | |
|---|---|
| `/` | Developer portal: students create their API key here |
| `/docs` | API documentation · `/docs.html?doc=brief` for the brief |
| `/swagger` | Swagger UI: try any endpoint |
| `/app` | Reference website (uses the demo key `anbani-demo-key`) |
| `/teacher` | Teacher dashboard. The secret in Development is `teacher-dev-secret` |
| `/health` | Health check |

**Demo accounts** on the reference website (all with password `Anbani2026!`):

| E-mail | State |
|---|---|
| `admin@anbani.ge` | Admin: dashboard, books, categories, users |
| `reader@anbani.ge` | Annual subscriber with payment history |
| `new@anbani.ge` | No subscription. Use it to try the free trial |

The demo sandbox also has 38 made-up readers with payments, reviews and reading progress, so the admin dashboard has real-looking numbers.

## How students work with it

1. **Get a key.** On the portal they enter a name, e-mail and group. Each key is a separate sandbox with its own users, subscriptions, payments and uploaded books, so nobody sees anybody else's data. The **first user registered in a sandbox becomes its admin**.
2. **Read the docs and the brief.** The brief (US-1 … US-14) says *what* to build and the docs explain *how*. Understanding the documentation is part of the grade.
3. **Build the website** in any stack (React, Vue, Angular, vanilla). CORS is open, so `localhost:5173` and deployed sites can both call the API.
4. **Use the sandbox tools** instead of waiting days for real events:
   - **Inbox**: e-mails the API "sent" (verification and reset codes, receipts).
   - **Test cards**: 8 outcomes (success, declined, insufficient funds, expired card, wrong CVC, processing error, and a card that fails on renewal). Real card numbers are refused.
   - **Time travel**: move the sandbox clock forward to see a trial expire or a subscription renew.
   - **Reset subscription**: start a scenario again.
5. **Compare with the reference site.** Open `/app`, sign in, and open the X-ray panel (bottom right). It shows every request the page makes, with headers (tokens masked), body and a copyable `curl`, plus the inbox, time travel and the decoded JWT.

## Teaching with it

- **Four one-week sprints** (brief §8): foundation → user → business → admin & quality, with a 5-minute demo after each one.
- **Rubric** (brief §9): 100 points + up to 19 bonus. It includes the check you run on every project: register → trial → read → time-travel 8 days → the UI must show `expired`; try every test card; leave the tab open for 15 minutes (token refresh); check at 360 px.
- **`/teacher`** lists every key with its requests, errors, users, subscriptions and uploaded books. It also shows **19 milestones** based on which endpoints the key has called (catalog, register, verify, refresh, trial, checkout, read, review, admin stats, create book…). You can see sprint progress without asking anyone. From the same page you can create keys for a group, disable a key, or wipe a sandbox.
- Students who say "the API is broken" can open the X-ray panel on the reference site and compare its requests with their own. Most problems turn out to be a missing header or a wrong body.

## Configuration

Settings live in [`src/BooksApi/appsettings.json`](src/BooksApi/appsettings.json). Every setting can be overridden with an environment variable, using `__` between levels (`Teacher__Secret`, `Sandbox__KeysPerHour`).

| Setting | Default | |
|---|---|---|
| `Teacher:Secret` | empty = off | Opens `/teacher` and `/api/teacher/*` (header `X-Teacher-Secret`) |
| `Jwt:Secret` | generated | At least 32 characters. If empty, one is generated once and kept in `<Storage:Root>/.jwt-secret` |
| `Storage:Root` | `storage` | SQLite database, uploads, generated JWT secret |
| `ConnectionStrings:Default` | `<Storage:Root>/books.db` | Any SQLite connection string |
| `Hosting:PublicBaseUrl` | from the request | Base for cover, preview and file links, e.g. `https://booksapi.stepacademy.ge` |
| `Hosting:WebAppPath`, `Hosting:DocsPath` | `../../web`, `../../docs` | Folders served as `/app` and `/content`. Empty = not served |
| `Sandbox:AllowSelfServiceKeys` | `true` | `false` = only the teacher creates keys |
| `Sandbox:SeedDemoData` | `true` | Demo users, payments and reviews for `Sandbox:DemoApiKey` |
| `Sandbox:EnableInbox` | `true` | `GET /api/sandbox/inbox` |
| `Sandbox:StorageQuotaMb`, `MaxPdfMb`, `MaxImageMb` | 200, 30, 3 | Upload limits per sandbox |
| `Sandbox:FileLinkMinutes` | 120 | How long a signed reading or download link works |
| `Sandbox:RequestsPerMinute`, `AuthRequestsPerMinute`, `KeysPerHour` | 300, 30, 10 | Rate limits (per key, per key + IP, per IP) |
| `Smtp:Host`, `User`, `Password`, `From` | off | Optional real e-mail. Without it, e-mails only go to the sandbox inbox |

## Deploy

The [Dockerfile](Dockerfile) packs the API, portal, docs and reference site into one image. Everything that changes at runtime is stored in `/data`.

```bash
echo "TEACHER_SECRET=$(openssl rand -hex 16)" > .env
echo "PUBLIC_BASE_URL=https://booksapi.stepacademy.ge" >> .env
docker compose up -d --build        # → http://localhost:8080
```

- **HTTPS is required.** Students deploy their sites to Vercel or Netlify over HTTPS, and browsers block calls from an HTTPS page to an HTTP API. Put a reverse proxy in front of the container. It honours `X-Forwarded-*` headers. With Caddy:
  ```
  booksapi.stepacademy.ge {
      reverse_proxy localhost:8080
  }
  ```
- **Backups:** the `booksapi-data` volume holds the database, the uploads and the JWT secret. Stop the container before copying it. The database runs in WAL mode, so a copy taken while it runs can miss recent writes.
- **Without Docker:** run `dotnet publish src/BooksApi -c Release -o out`, copy `web/` and `docs/` to the server, and set `Hosting__WebAppPath`, `Hosting__DocsPath` and `Storage__Root` to absolute paths. Run it behind IIS or nginx like any ASP.NET Core app.
- A new group each semester: wipe their sandboxes from `/teacher`, or delete the volume and start fresh. The built-in library and demo data are recreated on startup.

## The book library

30 public-domain books ship with the API in `src/BooksApi/SeedData/`: 11 Georgian classics (Ilia Chavchavadze, Akaki Tsereteli, Vazha-Pshavela, Alexander Kazbegi, Davit Kldiashvili, Mikheil Javakhishvili) from Georgian Wikisource, and 19 English classics from Project Gutenberg. Each book has a typeset PDF, a free preview PDF (about 10% of the book, ending with a "start your free trial" page) and a generated cover.

To rebuild them (for example after adding a book to `tools/content-builder/sources.mjs`):

```bash
cd tools/content-builder
npm install
npm run all          # download the texts into cache/, then typeset PDFs, previews, covers and catalog.json
node build.mjs dracula      # just one book · node build.mjs --covers  # covers only
```

The API syncs the catalog on its next start.

## Tests

```bash
dotnet test
```

41 integration tests run against the real API, each with its own temporary database: catalog and errors, auth and token rotation, the subscription state machine and test cards, library, reviews, admin, sandbox isolation, PDF uploads.

The Postman collection is generated by `node tools/postman/build-collection.mjs`.

## Project layout

```
src/BooksApi/            ASP.NET Core API (.NET 10, EF Core + SQLite)
  Controllers/           one controller per Swagger group
  Services/              subscriptions, fake payment gateway, tokens, e-mail, signed file links, PDF tools
  Data/                  DbContext, migrations, seeder
  SeedData/              built-in library: PDFs, previews, covers, catalog.json
  wwwroot/               developer portal, docs viewer, teacher dashboard, brand page
web/                     reference website (ES modules, hash router, no build step)
docs/                    api.ka.md, brief.ka.md, Postman collection
tests/BooksApi.Tests/    xUnit integration tests
tools/content-builder/   texts → PDFs, previews, covers (Node, pdfkit)
tools/postman/           Postman collection generator
```

## Licenses of what's bundled

- **Book texts:** public domain. The source of each book is in its colophon page and in `catalog.json`.
- **Fonts:** Spectral, Noto Serif Georgian and Noto Sans Georgian are embedded in the PDFs. Newsreader, Barlow Condensed, DM Sans, JetBrains Mono and Noto Sans/Serif Georgian are loaded on the website. All are under the SIL Open Font License 1.1.
- **Libraries:** pdf.js (Apache-2.0), PdfPig (Apache-2.0), marked (MIT), highlight.js (BSD-3-Clause), Swashbuckle (MIT), pdfkit and fontkit (MIT).
- PDFsharp is deliberately not used: from version 6.5 it requires a license key and is AGPL-licensed.
