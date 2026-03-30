# tempmail

A personal disposable email service running on [tempmail.sahildash.dev](https://tempmail.sahildash.dev). Built to generate clean, believable-looking temporary addresses on the `sahildash.dev` domain.

---

## Features

- **Pre-generated address pool**: addresses are drawn from a pool of realistic-looking username combinations
- **Receive-only inboxes**: no sending, no accounts, no storage beyond the session
- **Auto-expiry**: inboxes expire after 30 minutes of inactivity, address goes back to the pool
- **Live inbox polling**: new emails show up without refreshing
- **Rate limiting**: per-IP rolling rate limit on address allocation
- **No database**: everything lives in memory; private by design

---

## Stack

| Layer | Tech |
|---|---|
| Backend | [Hono](https://hono.dev) on Node.js (w/ TypeScript) |
| Email ingestion | Cloudflare Email Workers + [PostalMime](https://www.npmjs.com/package/postal-mime) |
| Frontend | Vanilla HTML/CSS/JS |

---

## How it works

1. You land on the site and get assigned a temporary address from the pool (ex: `realgeorgewashingtonusa@sahildash.dev`)
2. Any email sent to that address hits Cloudflare Email Routing, which forwards it to an Email Worker
3. The worker parses the message with PostalMime and POSTs it to the backend ingest endpoint
4. The frontend polls the backend every second and displays new messages as they arrive
5. After 30 minutes without activity, the session expires and the address is returned to the pool

---

## Project structure

```
tempmail/
├── emails.txt              # pre-generated address pool
├── server.ts               # Hono backend (allocation, sessions, ingest)
├── types.ts
├── frontend/
│   ├── index.html
│   ├── script.js
│   └── style.css
└── tempmail-worker/        # Cloudflare Email Worker
    └── src/index.ts
```

---

## Running locally

The backend needs a shared secret to authenticate requests from the Cloudflare worker. Set it in a `.env` file at the root:

```
CLOUDFLARE_API_SECRET=your_secret_here
```

Then install and start:

```bash
npm install
npx tsx server.ts
```

The frontend is static, so just open `frontend/index.html` or serve it however you like.

> Note: the email ingestion path requires a live Cloudflare Email Worker pointing at your running server, so local development for the full flow needs either a tunnel (like cloudflared) or you can hit the `/inbox/:address/add` endpoint manually to simulate incoming mail.

---

## Like this project? Feel free to give it a star!
