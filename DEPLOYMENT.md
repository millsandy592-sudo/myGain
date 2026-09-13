# MyGain production deployment

This project is the existing MyGain/MyTime application prepared for public deployment without replacing its existing UI or business logic.

## 1. What is included

- `server.js` — Node.js HTTP server and API.
- HTML/CSS/JS files — existing member and admin interfaces.
- `data/db.json` — the current application database/data snapshot. Treat it as private financial/account data.
- `.env.example` — safe environment-variable template.
- `.gitignore` — prevents secrets and local database files from being committed.

`server copy.js` is retained as a non-public source backup. The production server will not serve it.

## 2. Required environment variables

At minimum, set:

- `NODE_ENV=production`
- `PORT` — supplied by the hosting provider; do not hard-code a public port.
- `HOST=0.0.0.0`
- `MYGAIN_ADMIN_EMAIL` and `MYGAIN_ADMIN_PASSWORD` **only if the database does not already contain an admin account**.

`MYGAIN_DATA_DIR` is optional. Use it when your host provides a persistent disk/volume. The application will store `db.json` there.

Never commit `.env` or real credentials.

## 3. Install dependencies

There are currently no third-party npm runtime dependencies.

Run:

```bash
npm install
```

## 4. Start locally

Set the variables from `.env.example` in your local environment, then run:

```bash
npm start
```

The application listens on `HOST:PORT`.

Health check:

```text
GET /healthz
```

It should return JSON containing `"ok": true`.

## 5. Start in production

Configure the hosting service to run:

```bash
npm start
```

The host must provide a Node.js runtime compatible with Node 18.18 or newer.

The service must expose the port supplied through `PORT` and must allow the process to bind to `0.0.0.0`.

## 6. Database/storage requirement

The application currently uses a JSON database at `data/db.json`. It has **not** been migrated to PostgreSQL or another database.

This is safe only when the hosting environment provides persistent writable storage. Many serverless/ephemeral hosts erase local files during redeploys or restarts.

If your host has a persistent disk, set `MYGAIN_DATA_DIR` to that disk location and copy the existing `db.json` there before switching traffic to the new deployment.

If your chosen host has no persistent storage, stop before deployment and choose a persistent-disk option or approve a database migration. Do not deploy this application on an ephemeral filesystem while relying on `db.json` for live balances and transactions.

## 7. Preserve the current data

Before deployment:

1. Make a separate backup of the current `data/db.json`.
2. Do not delete, reset, or regenerate it.
3. Place the preserved database on the production persistent disk.
4. Verify that the file is readable by the Node.js process.
5. Keep an additional offline backup before approving real transactions.

The server writes the database through a temporary file and rename operation and restricts the database file permissions where the operating system permits it.

## 8. Domain and HTTPS

Point your domain's DNS record to the hosting provider according to that provider's instructions.

Enable the provider's HTTPS/TLS certificate before accepting real member traffic.

The Node.js app is designed to run behind a normal HTTPS reverse proxy/load balancer. The host terminates TLS and forwards requests to the Node process.

The server sends HSTS when the request is received through HTTPS (including common `X-Forwarded-Proto: https` proxy setups).

## 9. First admin

The current database already contains an administrator account. The application will **not** replace that account automatically.

If starting from an empty database, set `MYGAIN_ADMIN_EMAIL` and `MYGAIN_ADMIN_PASSWORD` before the first startup. Use a unique, strong password. Do not put that password in source code.

After deployment, use the admin panel's password-change feature to rotate the initial password if appropriate.

When publishing frontend changes, update the query-string versions on shared CSS and JavaScript assets in the HTML files. This forces browsers and CDNs to load the current features instead of an older cached bundle.

## 10. Deposit account configuration

The current data snapshot does not contain a configured production deposit account. The member UI therefore still has the existing fallback/test presentation.

**Do not publish real deposit instructions until the real account details and support contact have been configured in the admin area.** Do not guess or invent these values.

The admin deposit-account controls now persist to the server-side database rather than relying only on browser local storage.

## 11. What must never be public

Never publish or commit:

- `.env`
- real passwords/API keys/session secrets
- `data/db.json`
- database backups
- private logs containing account information
- private deployment credentials

The server also refuses direct requests for the database, environment files, package metadata, server source, and the retained `server copy.js` backup.

## 12. Backups

For a JSON database, back up `db.json` before:

- changing financial settings
- changing products/rates
- upgrading the server
- changing hosting/storage
- performing maintenance

Keep backups outside the public web root and restrict access to them.

## 13. Restore

1. Stop the application.
2. Keep the damaged/current `db.json` as a separate backup.
3. Copy the verified backup into the configured `MYGAIN_DATA_DIR` (or `data/` if no custom data directory is configured).
4. Ensure the file is named `db.json`.
5. Ensure the Node process can read and write it.
6. Start the application.
7. Check `/healthz` and log in as both admin/member before accepting transactions.

## 14. Deployment test checklist

After deployment, test in a non-production/test account first:

- [ ] `/healthz` responds successfully.
- [ ] Member home page loads.
- [ ] Admin page loads.
- [ ] Member registration works.
- [ ] Member login/logout works.
- [ ] Admin login/logout works.
- [ ] Session expiry/authentication works.
- [ ] Profile changes save.
- [ ] Deposit request can be submitted.
- [ ] Withdrawal request can be submitted only when eligible.
- [ ] Admin can approve/reject payment requests.
- [ ] Approved/rejected payment requests cannot be changed again.
- [ ] Level purchases use server-side product amounts.
- [ ] Vault openings cannot be opened twice for the same member/vault/day.
- [ ] Referral rewards are generated server-side.
- [ ] Admin settings save and survive a restart.
- [ ] Deposit accounts save and survive a restart.
- [ ] Market API failures do not crash the server.
- [ ] `/server.js`, `/server copy.js`, `.env`, `package.json`, and `/data/db.json` are not publicly downloadable.
- [ ] HTTPS is active before real credentials or financial activity are used.

## 15. Important production limitation

This application is still based on a single JSON file rather than a transactional database. That is the largest remaining architectural limitation for a high-volume financial platform.

For a small/controlled deployment with a reliable persistent volume, the existing approach can be retained. If transaction volume or concurrency becomes significant, plan a carefully tested database migration with backups and reconciliation. Do not perform that migration as part of an ordinary deployment without a separate approval and migration plan.
