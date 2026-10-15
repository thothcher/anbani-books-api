// Generates docs/postman/BooksAPI.postman_collection.json
//   node tools/postman/build-collection.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'postman', 'BooksAPI.postman_collection.json');

const json = (obj) => JSON.stringify(obj, null, 2);
const save = (pairs) => Object.entries(pairs).map(([v, expr]) => `pm.collectionVariables.set('${v}', ${expr});`);
const saveTokens = [
  'const r = pm.response.json();',
  "if (r.accessToken) { pm.collectionVariables.set('accessToken', r.accessToken); pm.collectionVariables.set('refreshToken', r.refreshToken); }",
  "pm.test('tokens received', () => pm.expect(r.accessToken).to.be.a('string'));",
];
const expectStatus = (code) => [`pm.test('status ${code}', () => pm.response.to.have.status(${code}));`];

function req(name, method, path, { body, query, desc, test = [], form } = {}) {
  const [p, q] = path.split('?');
  const url = {
    raw: `{{baseUrl}}${path}`,
    host: ['{{baseUrl}}'],
    path: p.split('/').filter(Boolean),
    ...(q ? { query: q.split('&').map((kv) => { const [key, value] = kv.split('='); return { key, value }; }) } : {}),
  };
  const request = { method, header: [], url, description: desc ?? '' };
  if (body !== undefined) {
    request.header.push({ key: 'Content-Type', value: 'application/json' });
    request.body = { mode: 'raw', raw: json(body), options: { raw: { language: 'json' } } };
  }
  if (form) request.body = { mode: 'formdata', formdata: [{ key: 'file', type: 'file', src: [], description: form }] };
  const item = { name, request };
  if (test.length) item.event = [{ listen: 'test', script: { type: 'text/javascript', exec: test } }];
  return item;
}

const folder = (name, description, item) => ({ name, description, item });

const collection = {
  info: {
    name: 'BooksAPI — Anbani digital library',
    description: [
      'სასწავლო API: ავტორიზაცია, PDF წიგნების კატალოგი, გამოწერა უფასო საცდელით, კითხვა, ადმინ-პანელი.',
      '',
      '1. Collection → Variables: ჩასვით `baseUrl` და თქვენი `apiKey` (ან გაუშვით „0. Developer → Create API key“).',
      '2. გაუშვით რიგრიგობით: Register → Inbox (კოდი ავტომატურად ინახება) → Verify email → Start trial → Read.',
      '3. `X-API-KEY` და `Authorization` ჰედერებს collection-ის pre-request სკრიპტი ამატებს ავტომატურად.',
      '',
      'დოკუმენტაცია: {{baseUrl}}/docs · Swagger: {{baseUrl}}/swagger',
    ].join('\n'),
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  event: [
    {
      listen: 'prerequest',
      script: {
        type: 'text/javascript',
        exec: [
          '// Every request gets the API key; signed-in requests also get the Bearer token.',
          "pm.request.headers.upsert({ key: 'X-API-KEY', value: pm.collectionVariables.get('apiKey') });",
          "pm.request.headers.upsert({ key: 'Accept-Language', value: pm.collectionVariables.get('language') || 'ka' });",
          "const token = pm.collectionVariables.get('accessToken');",
          "const isAuth = pm.request.url.getPath().startsWith('/api/auth');",
          "if (token && !isAuth) pm.request.headers.upsert({ key: 'Authorization', value: 'Bearer ' + token });",
        ],
      },
    },
  ],
  variable: [
    { key: 'baseUrl', value: 'http://localhost:5080' },
    { key: 'apiKey', value: 'anbani-demo-key' },
    { key: 'language', value: 'ka' },
    { key: 'email', value: 'student@example.com' },
    { key: 'password', value: 'Reading2026' },
    { key: 'accessToken', value: '' },
    { key: 'refreshToken', value: '' },
    { key: 'code', value: '' },
    { key: 'bookId', value: '12' },
    { key: 'planId', value: '1' },
    { key: 'reviewId', value: '' },
    { key: 'categoryId', value: '' },
    { key: 'newBookId', value: '' },
    { key: 'userId', value: '' },
  ],
  item: [
    folder('0. Developer', 'API გასაღები — ერთხელ, პროექტის დასაწყისში.', [
      req('Create API key', 'POST', '/api/developer/keys', {
        body: { name: 'Student Name', email: '{{email}}', group: 'FE-2026' },
        desc: 'X-API-KEY არ სჭირდება. პასუხის გასაღები ავტომატურად ინახება `apiKey` ცვლადში.',
        test: [...expectStatus(201), "pm.collectionVariables.set('apiKey', pm.response.json().apiKey);"],
      }),
      req('My API key', 'GET', '/api/developer/me'),
    ]),
    folder('1. Auth', 'რეგისტრაცია, დადასტურება, შესვლა, ტოკენები, პაროლის აღდგენა.', [
      req('Register', 'POST', '/api/auth/register', {
        body: { firstName: 'Nino', lastName: 'Beridze', email: '{{email}}', password: '{{password}}' },
        test: [...expectStatus(201), ...saveTokens],
      }),
      req('Inbox (get the code)', 'GET', '/api/sandbox/inbox?email={{email}}', {
        desc: 'ბოლო წერილის კოდი ინახება `code` ცვლადში.',
        test: ["const m = pm.response.json().items.find((x) => x.code);", "if (m) pm.collectionVariables.set('code', m.code);", "pm.test('code found', () => pm.expect(m).to.exist);"],
      }),
      req('Verify email', 'POST', '/api/auth/verify-email', { body: { email: '{{email}}', code: '{{code}}' }, test: [...expectStatus(200), ...saveTokens] }),
      req('Resend verification', 'POST', '/api/auth/resend-verification', { body: { email: '{{email}}' } }),
      req('Login', 'POST', '/api/auth/login', { body: { email: '{{email}}', password: '{{password}}' }, test: [...expectStatus(200), ...saveTokens] }),
      req('Refresh tokens', 'POST', '/api/auth/refresh', { body: { refreshToken: '{{refreshToken}}' }, desc: 'ძველი refresh token ამის შემდეგ აღარ მუშაობს (rotation).', test: [...expectStatus(200), ...saveTokens] }),
      req('Forgot password', 'POST', '/api/auth/forgot-password', { body: { email: '{{email}}' } }),
      req('Reset password', 'POST', '/api/auth/reset-password', { body: { email: '{{email}}', code: '{{code}}', newPassword: 'NewPassword2026' }, desc: 'ჯერ გაუშვით „Forgot password“ და „Inbox“.' }),
      req('Logout', 'POST', '/api/auth/logout', { body: { refreshToken: '{{refreshToken}}' }, test: [...expectStatus(204), "pm.collectionVariables.set('accessToken', ''); pm.collectionVariables.set('refreshToken', '');"] }),
    ]),
    folder('2. Users', 'საკუთარი ანგარიში.', [
      req('Me', 'GET', '/api/users/me', { test: ["pm.collectionVariables.set('userId', pm.response.json().id);"] }),
      req('Profile', 'GET', '/api/users/profile'),
      req('Update profile', 'PUT', '/api/users/profile', { body: { firstName: 'Nino', lastName: 'Beridze', phone: '+995 555 12 34 56', bio: 'ვკითხულობ ყველაფერს.' } }),
      req('Change password', 'PUT', '/api/users/change-password', { body: { currentPassword: '{{password}}', newPassword: 'Reading2027' } }),
      req('Upload avatar', 'POST', '/api/users/avatar', { form: 'JPG / PNG / WEBP, max 3 MB' }),
      req('Delete avatar', 'DELETE', '/api/users/avatar'),
      req('Delete my account', 'DELETE', '/api/users/me', { desc: '⚠️ სამუდამოდ შლის ანგარიშს.' }),
    ]),
    folder('3. Catalog', 'კატეგორიები და წიგნები — სტუმრისთვისაც ღიაა.', [
      req('Categories', 'GET', '/api/categories'),
      req('Books', 'GET', '/api/books?page=1&pageSize=12&sort=popular'),
      req('Books — search & filters', 'GET', '/api/books?q=wells&language=en&minRating=4&sort=rating&order=desc'),
      req('Books — free only', 'GET', '/api/books?isFree=true'),
      req('Book details', 'GET', '/api/books/{{bookId}}'),
      req('Related books', 'GET', '/api/books/{{bookId}}/related?take=6'),
      req('Read (signed PDF link)', 'GET', '/api/books/{{bookId}}/read', { desc: '402 — გამოწერა საჭიროა. პასუხის `url` გახსენით ბრაუზერში.' }),
      req('Download link', 'GET', '/api/books/{{bookId}}/download', { desc: 'მხოლოდ წლიური ფასიანი გეგმა (403 DOWNLOAD_NOT_INCLUDED).' }),
    ]),
    folder('4. Reviews', 'შეფასებები.', [
      req('Reviews of a book', 'GET', '/api/books/{{bookId}}/reviews?page=1&pageSize=10&sort=newest'),
      req('My review of a book', 'GET', '/api/books/{{bookId}}/reviews?mine=true'),
      req('Add review', 'POST', '/api/books/{{bookId}}/reviews', { body: { rating: 5, comment: 'შესანიშნავი წიგნია!' }, test: [...expectStatus(201), "pm.collectionVariables.set('reviewId', pm.response.json().id);"] }),
      req('Edit review', 'PUT', '/api/reviews/{{reviewId}}', { body: { rating: 4, comment: 'ძალიან კარგია.' } }),
      req('Delete review', 'DELETE', '/api/reviews/{{reviewId}}'),
    ]),
    folder('5. Library', 'რჩეულები, პროგრესი, სტატისტიკა.', [
      req('Add to favorites', 'POST', '/api/library/favorites/{{bookId}}'),
      req('Favorites', 'GET', '/api/library/favorites'),
      req('Remove from favorites', 'DELETE', '/api/library/favorites/{{bookId}}'),
      req('Save progress', 'PUT', '/api/library/progress/{{bookId}}', { body: { currentPage: 42 } }),
      req('Reading now', 'GET', '/api/library/progress?status=reading'),
      req('Finished', 'GET', '/api/library/progress?status=finished'),
      req('Remove from history', 'DELETE', '/api/library/progress/{{bookId}}'),
      req('Reading stats', 'GET', '/api/library/stats'),
    ]),
    folder('6. Subscription & Payments', 'გეგმები, საცდელი, გადახდა, გაუქმება.', [
      req('Plans', 'GET', '/api/plans'),
      req('My subscription', 'GET', '/api/subscription'),
      req('Start free trial', 'POST', '/api/subscription/trial', { body: { planId: '{{planId}}' }, desc: 'საჭიროა დადასტურებული ელ-ფოსტა.' }),
      req('Checkout — success', 'POST', '/api/subscription/checkout', { body: { planId: 2, card: { number: '4242 4242 4242 4242', holderName: 'Nino Beridze', expMonth: 12, expYear: 2030, cvc: '123' } } }),
      req('Checkout — declined', 'POST', '/api/subscription/checkout', { body: { planId: 2, card: { number: '4000 0000 0000 0002', holderName: 'Nino Beridze', expMonth: 12, expYear: 2030, cvc: '123' } }, test: expectStatus(402) }),
      req('Checkout — invalid card', 'POST', '/api/subscription/checkout', { body: { planId: 2, card: { number: '1234', holderName: '', expMonth: 13, expYear: 2020, cvc: '1' } }, test: expectStatus(400) }),
      req('Cancel', 'POST', '/api/subscription/cancel'),
      req('Resume', 'POST', '/api/subscription/resume'),
      req('Change plan', 'PUT', '/api/subscription/plan', { body: { planId: 1 } }),
      req('Update card', 'PUT', '/api/subscription/payment-method', { body: { card: { number: '5555 5555 5555 4444', holderName: 'Nino Beridze', expMonth: 6, expYear: 2031, cvc: '321' } } }),
      req('Payments', 'GET', '/api/payments?page=1&pageSize=10'),
    ]),
    folder('7. Sandbox', 'სასწავლო ინსტრუმენტები: ინბოქსი, ბარათები, დროში მოგზაურობა.', [
      req('Inbox', 'GET', '/api/sandbox/inbox?email={{email}}'),
      req('Clear inbox', 'DELETE', '/api/sandbox/inbox?email={{email}}'),
      req('Test cards', 'GET', '/api/sandbox/test-cards'),
      req('My clock', 'GET', '/api/sandbox/clock'),
      req('Time travel +8 days', 'POST', '/api/sandbox/time-travel', { body: { days: 8 }, desc: 'საცდელი პერიოდი იწურება — შემდეგ ნახეთ „My subscription“.' }),
      req('Time travel +31 days', 'POST', '/api/sandbox/time-travel', { body: { days: 31 }, desc: 'თვიური გამოწერა ავტომატურად ახლდება.' }),
      req('Reset subscription', 'POST', '/api/sandbox/reset-subscription'),
    ]),
    folder('8. Admin', 'მხოლოდ role = admin (sandbox-ის პირველი მომხმარებელი).', [
      req('Dashboard stats', 'GET', '/api/admin/stats'),
      req('Users', 'GET', '/api/admin/users?page=1&pageSize=20'),
      req('Users — active subscribers', 'GET', '/api/admin/users?status=active'),
      req('Make admin', 'PUT', '/api/admin/users/{{userId}}/role', { body: { role: 'admin' } }),
      req('Grant free access', 'POST', '/api/admin/users/{{userId}}/grant', { body: { planId: 2, days: 30 } }),
      req('Delete user', 'DELETE', '/api/admin/users/{{userId}}'),
      req('Payments', 'GET', '/api/admin/payments?status=succeeded'),
      req('Create category', 'POST', '/api/categories', { body: { name: 'პროგრამირება', nameEn: 'Programming' }, test: [...expectStatus(201), "pm.collectionVariables.set('categoryId', pm.response.json().id);"] }),
      req('Update category', 'PUT', '/api/categories/{{categoryId}}', { body: { name: 'პროგრამირება და IT', nameEn: 'Programming & IT' } }),
      req('Delete category', 'DELETE', '/api/categories/{{categoryId}}'),
      req('Create book (draft)', 'POST', '/api/books', {
        body: { title: 'JavaScript-ის საფუძვლები', author: 'ნინო ბერიძე', description: 'მოკლე სახელმძღვანელო დამწყებთათვის: ცვლადები, ფუნქციები, მასივები და ობიექტები.', categoryId: '{{categoryId}}', language: 'ka', year: 2026, isFree: false, tags: ['javascript'] },
        test: [...expectStatus(201), "pm.collectionVariables.set('newBookId', pm.response.json().id);"],
      }),
      req('Upload PDF', 'PUT', '/api/books/{{newBookId}}/pdf', { form: 'PDF, max 30 MB' }),
      req('Upload cover', 'PUT', '/api/books/{{newBookId}}/cover', { form: 'JPG / PNG / WEBP, 2:3, max 3 MB' }),
      req('Publish', 'PUT', '/api/books/{{newBookId}}', { body: { isPublished: true }, desc: '409 PDF_REQUIRED — ჯერ ატვირთეთ PDF.' }),
      req('Books incl. drafts', 'GET', '/api/books?includeDrafts=true&sort=newest'),
      req('Delete book', 'DELETE', '/api/books/{{newBookId}}'),
    ]),
  ],
};

// Postman wants numbers in raw JSON bodies to stay numbers; "{{planId}}" inside quotes would be a string.
const text = JSON.stringify(collection, null, 2).replace(/\\"\{\{(planId|categoryId)\}\}\\"/g, '{{$1}}');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, text, 'utf8');
console.log('written', OUT);
