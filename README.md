# Coco & Co. chocolate demo

## Run locally

Use Node.js 24.11 or newer:

```sh
npm start
```

Open `http://127.0.0.1:4173/`. Accounts, sessions, recharge orders, product orders, active plans, earned reward days, withdrawal requests, and store-credit entries are stored in `data/coco-auth.sqlite`; keep the `data` directory private and out of public hosting. For registration and sign-in, open `http://127.0.0.1:4173/auth.html` while this server is running; VS Code Live Server and `file://` do not provide the API.

## Razorpay store-credit recharge

The recharge screen uses Razorpay Standard Checkout. The Node server creates each order, checks the Checkout signature and captured payment with Razorpay, and adds store credit once. Configure these values as **server environment secrets**; do not add credentials to browser code, Git, or a public `.env` file:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET` (recommended for the `payment.captured` webhook)

For local testing in PowerShell, set Razorpay test credentials in the current shell before running `npm start`:

```powershell
$env:RAZORPAY_KEY_ID = "rzp_test_..."
$env:RAZORPAY_KEY_SECRET = "..."
$env:RAZORPAY_WEBHOOK_SECRET = "..."
npm start
```

Use Razorpay **test-mode** keys while preparing the integration. In the Razorpay Dashboard, configure the webhook URL as `https://<your-app-origin>/api/webhooks/razorpay`, subscribe to `payment.captured`, and copy its webhook secret into the server environment. The server grants wallet credit and marks product orders paid only for captured payments, so configure automatic capture in Razorpay. Checkout callbacks and webhooks are verified server-side; duplicate events cannot add the same recharge credit twice.

The app must be served by the Node backend from the same origin as its pages so the account session works. GitHub Pages serves static files and cannot run `server.js` or these payment endpoints. Deploy the Node app and a persistent production database before accepting real payments; the included SQLite database is a local prototype, not a production wallet ledger. Add HTTPS and set `NODE_ENV=production` on the host. Razorpay live keys are for use after merchant-account activation.

Product-card BUY uses account store credit first and deducts it on the server when sufficient. Razorpay opens only when the balance is insufficient; both modes use server-validated prices and server-side payment verification. Bought plans appear from the home-screen Updates shortcut. Their displayed daily reward is recorded after each full 24 hours, up to the plan duration.

## Reward withdrawals and admin review

Withdrawal requests reserve the requested amount from earned rewards and appear in the signed-in administrator's panel. The configured administrator can accept or reject each pending request. Rejecting releases the reserved rewards; accepting records the approval in the app. This admin decision does not initiate a bank or UPI transfer.

Set `ADMIN_EMAIL` to the email or phone sign-in identifier of the existing account that should receive admin access, then restart the Node server. That identifier is checked on both the server and the interface; do not add admin credentials to browser code. In PowerShell:

```powershell
$env:ADMIN_EMAIL = "admin@example.com"
npm start
```

After signing in with that account, open **My → Withdrawal admin panel** to review requests.

Razorpay references: [Standard Checkout integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) · [Webhooks](https://razorpay.com/docs/webhooks/validate-test/).

## Authentication notes

- Email/phone and password registration, sign-in, and sign-out use the local Node server; registration does not require OTP verification.
- The standalone authentication page and its styles and client logic live in `auth.html`, `auth.css`, and `auth.js`; the shop's account navigation opens that page.
- Passwords are stored as per-account salted scrypt hashes. Session tokens are random, stored as hashes in SQLite, and sent in HttpOnly, SameSite cookies.
- The app currently has no email/OTP verification or password recovery. Do not expose it as a public service until HTTPS, verified-email delivery, recovery flows, and a production database/auth provider are configured.
- The built-in Node SQLite module is experimental in this Node release. Treat this backend as a local prototype; use a supported production database/auth provider before public deployment.
