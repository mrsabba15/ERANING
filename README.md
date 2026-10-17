# Coco & Co. chocolate demo

## Run locally

Use Node.js 24.11 or newer:

```sh
npm start
```

Open `http://127.0.0.1:4173/`. Accounts and sessions are stored in `data/coco-auth.sqlite`; keep the `data` directory private and out of public hosting.
For registration and sign-in, open `http://127.0.0.1:4173/auth.html` while this server is running; VS Code Live Server and `file://` do not provide the authentication API.

## Authentication notes

- Email/phone and password registration, sign-in, and sign-out use the local Node server; registration does not require OTP verification.
- The standalone authentication page and its styles and client logic live in `auth.html`, `auth.css`, and `auth.js`; the shop's account navigation opens that page.
- Passwords are stored as per-account salted scrypt hashes. Session tokens are random, stored as hashes in SQLite, and sent in HttpOnly, SameSite cookies.
- The app currently has no email/OTP verification or password recovery. Do not expose it as a public service until HTTPS, verified-email delivery, recovery flows, and a production database/auth provider are configured.
- The built-in Node SQLite module is experimental in this Node release. Treat this backend as a local prototype; use a supported production database/auth provider before public deployment.
