# Farm-E

Farm-E is a produce marketplace prototype connecting farmers and buyers. Farmers publish crop listings and respond to buyer requirements; buyers place orders or accept bids and both parties follow delivery and weight verification in the order workflow.

## Marketplace capabilities

- Buyer requirements show ranked listing suggestions with an explainable score for crop, quantity, price, quality, harvest timing, and approximate distance.
- Farmers can attach up to five JPEG, PNG, or WebP crop photos (5 MB each). Marketplace cards and map popups show thumbnails; map pins display price and nearby harvests cluster together.
- Order participants can attach delivery photos or weight records. Evidence files are stored privately and can only be downloaded by an order participant or an administrator; dispute pages show the order evidence.
- Users can turn their in-app notification inbox on or off. Farmers can opt into new-order SMS alerts; the notification records whether the job was sent to the provider, simulated, retrying, or failed.

## Architecture

The current system is a **modular monolith**, not a microservices deployment:

- `client/`: React 19 and Vite single-page app.
- `server/`: Express API, MongoDB/Mongoose models, Socket.IO conversations and auction rooms, and the notification worker.
- MongoDB stores accounts, listings, bids, orders, contracts, notifications, and retryable SMS jobs.
- Email/password and Google sign-in share the same server-issued access token and rotating HttpOnly refresh-cookie session.
- Listing photos and private order evidence use local storage in development and private Cloudflare R2 object storage in the deployment blueprint.

See [the architecture and workflow diagrams](docs/architecture.md).

## Run locally

Use Node.js and npm, then install dependencies in both folders:

```powershell
cd server
npm install
```

Create `server/.env` from `server/.env.example`, set strong local JWT secrets, and choose a transaction-capable MongoDB setup. Order and contract creation use multi-document transactions:

- For a disposable local demo database, set `MONGO_MEMORY=true`. It starts a temporary one-node MongoDB replica set; data is lost when the server stops.
- For persistent data, set `MONGO_URI` to MongoDB Atlas or a self-managed replica set. A standalone local MongoDB instance cannot run these transactions.

To enable Google sign-in, create a Google OAuth **Web application** client ID in [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Add the development origins (`http://localhost:5173` and `http://127.0.0.1:5173`, if you use both) and your production HTTPS frontend origin as authorized JavaScript origins. Google rejects raw LAN IP origins such as `http://172.20.10.4:5173`; mobile sign-in therefore requires a stable HTTPS domain or tunnel that is also registered as an authorized JavaScript origin. Set the same client ID as `GOOGLE_CLIENT_ID` in `server/.env` and `VITE_GOOGLE_CLIENT_ID` in `client/.env.local`, then restart both servers. Set `VITE_PUBLIC_APP_URL` to the same reachable frontend origin for QR passports. The backend verifies Google ID tokens and only accepts verified email addresses. New Google accounts choose Farmer or Buyer and do not need to provide a phone number; existing accounts with the same verified email can link and sign in. Google sign-in stays unavailable until both client ID values are configured. See [Google's setup guide](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) and [origin validation rules](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow#origin-validation).

Start the backend in one terminal:

```powershell
cd server
npm run dev
```

Start the frontend in a second terminal:

```powershell
cd client
npm install
npm run dev -- --host 0.0.0.0
```

Open `http://localhost:5173`. The API health endpoint is `http://localhost:5000/health`.

## Free demo deployment

The repository includes `render.yaml` for a single-origin deployment: Render runs the Express API and serves the built React app, while MongoDB Atlas stores database records and uploaded files in GridFS. This keeps refresh cookies, live Socket.IO connections, and user uploads on the same origin without needing a separate object-storage subscription. Node.js is pinned in `.node-version`.

This is a zero-compute-cost **demo setup**, not an uptime-guaranteed production service. Render says its Free web services are for hobby projects and previews, sleep after 15 minutes without traffic, can take about a minute to wake, and have an ephemeral filesystem. The database and user files are therefore configured outside Render. Render may also suspend free services at usage limits. See [Render's free instance limits](https://render.com/docs/free).

Atlas Free clusters provide a three-node replica set with a 0.5 GB total storage limit and operational limits. GridFS stores file data in the same Atlas database, so application records, indexes, and uploaded files share that 512 MB capacity; use it for a small demo and monitor Atlas storage. Atlas offers limited daily snapshots when its Free cluster backups are enabled; do not rely on them as your only backup. See [Atlas Free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/) and [MongoDB GridFS](https://www.mongodb.com/docs/drivers/node/current/crud/gridfs/).

### Before you publish

1. Push the project to a **private** GitHub repository and connect that repository to Render. The `.gitignore` excludes `.env` files, local databases, uploaded user files, and the local report/screenshots. Check `git status` before pushing; never copy `server/.env` or `client/.env.local` into GitHub.
2. Create an Atlas Free cluster and database user. Choose a region close to the Render service. After creating the Render service, copy its outbound IP ranges from **Connect → Outbound** and add those ranges in Atlas Network Access. Keep the Atlas database user limited to the app database.
3. In Render, create a Blueprint from the repository and use `render.yaml`. Render generates the three signing secrets. Add this value in Render's Environment page; it is intentionally not stored in source control:
   - `MONGO_URI`: Atlas connection string. The server forces `retryWrites=false` for compatibility and transaction-based workflows require Atlas's replica set.
4. If you use a custom domain, set `CORS_ORIGIN` to its exact HTTPS origin (no trailing slash). The Render-provided site URL is detected automatically when `CORS_ORIGIN` is empty.
5. Create the first administrator only if you need the admin moderation tools. Use the one-time `npm run admin:create` command from `server/` with `MONGO_URI`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PHONE`, and a strong `ADMIN_PASSWORD` set in the shell. The script refuses to overwrite an existing account.
6. Deploy and check `/health`. Render generates the site URL. Request a free CARTO basemap key at [CARTO Basemaps](https://carto.com/basemaps/apikey), restrict it to your Render HTTPS origin, and set `VITE_CARTO_BASEMAP_KEY` in Render. The map tile key is included in the browser bundle, so restrict its allowed origin. Without it, the app falls back to public OSM tiles, which may block production traffic. Then create a Google OAuth Web client, add that HTTPS URL as an authorized JavaScript origin, and add the same client ID as `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` in Render. Rebuild after setting frontend `VITE_` values; Google sign-in stays disabled until both values are set. Keep the generated `TRACE_SIGNING_SECRET` stable after launch so existing signed passports remain verifiable. Test account registration and refresh, Google sign-in if configured, listings/photo uploads, requirements and bids, auction rooms, chat after refresh, order creation and updates, private evidence upload/download, notifications, disputes, and admin actions. Use two browser accounts for buyer/farmer workflows. Existing local database records and uploaded files do not move to Atlas automatically.

The server applies generous API, login, and upload rate limits. With one free Render instance, counters fall back to bounded in-memory storage; configure shared Redis before scaling beyond one instance. Avoid enabling demo seeding on a public deployment; production startup explicitly rejects `SEED_DEMO_DATA=true`.

If the Atlas database already contains data from an older Farm-E build, run `npm run migrate:remove-expiry-ttl` and `npm run migrate:remove-refresh-token-ttl` once from `server/` before using it. These remove legacy TTL indexes that could delete parent user or marketplace records.

## Payment and SMS behavior

- **Payment is simulated.** Recording payment changes the Farm-E order record only; no funds are transferred.
- Email delivery is a simulator; the current app does not send transactional email.
- **Free SMS demo:** keep `SMS_PROVIDER=mock`. New orders create an in-app notification and a durable SMS job. The worker marks the SMS `simulated (SMS disabled)` in the Notifications page; no message is sent to a phone.
- **Real SMS:** configure `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` in `server/.env`. Keep credentials out of source control. Twilio trial accounts may provide limited free trial units, but restrict who you can message and trial duration; ongoing SMS is charged per message. Check the [current India SMS pricing](https://www.twilio.com/en-us/sms/pricing/in) and [trial restrictions](https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account) before enabling it.

The SMS worker retries temporary failures with backoff and records delivery state in the notification. Retries are best-effort and may send a duplicate if the provider accepted a message but the server lost the response before recording success.

## Important project limitations

- New QR batch passports include a Farm-E HMAC-SHA256 signature over an issued batch snapshot. Scanning checks that signature online; older orders are labeled unsigned. This confirms the Farm-E record has not changed since issuance, but does not prove the physical produce is genuine or validate farmer-listed certificates. Production deployments must set a stable, private `TRACE_SIGNING_SECRET` of at least 32 bytes; changing it invalidates existing QR signatures.
- Payment processing is not integrated with a bank or payment gateway.
- Actual SMS delivery requires a configured provider account; the default mode is a simulator.
- Automated backend tests cover matching rules, concurrent stock reservation and cancellation, order-participant authorization, and private evidence upload/download. Full browser end-to-end coverage is still not included.
- Browser refresh tokens are stored in an HttpOnly cookie and access tokens in memory. Existing users need to sign in again after this token-storage change.
- Routing and geocoding still use best-effort public Nominatim/OSRM services with usage limits and no availability guarantee. Follow the [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/). Deployed maps use CARTO basemaps with visible CARTO and OpenStreetMap attribution; free usage limits apply, so review [CARTO's current basemap terms](https://carto.com/legal/basemap-terms/).

## Checks

From `client/`, `npm run build` creates the production frontend bundle and `npm run lint` runs Oxlint. From `server/`, `npm run lint` checks JavaScript syntax, `npm test` runs matching unit and workflow integration tests, and `npm run evaluate:matching` prints the synthetic ranking evaluation. See the test limitation above before a project defense or production deployment.

## Repeatable presentation demo

For a local classroom demo, set `SEED_DEMO_DATA=true` and set `DEMO_PASSWORD` to a private password with at least 12 characters in `server/.env`. The API seeds four local-only accounts (two farmers, a buyer, and an admin), farms, four listings, and a public tomato requirement on startup. Seeding is idempotent and resets those demo accounts to `DEMO_PASSWORD` at each start. It is disabled by default and refuses to run when `NODE_ENV=production`.

Demo sign-in emails are `farmer@farm-e.local`, `farmer2@farm-e.local`, `buyer@farm-e.local`, and `admin@farm-e.local`; use the local `DEMO_PASSWORD` value for each. With `MONGO_MEMORY=true`, the database is temporary, but the demo records are reseeded on each server start. Do not use demo credentials or seed mode outside local development.

Run `npm test` in `server/` for matching-rule unit tests. Run `npm run evaluate:matching` for a small, deterministic synthetic ranking evaluation. Its hand-labeled scenarios are a smoke check, not a claim of real-world recommendation accuracy; evaluate with consented or clearly synthetic data before making performance claims.
