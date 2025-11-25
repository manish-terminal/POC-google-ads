# Google Ads Backend

This backend exposes OAuth helpers and reporting endpoints for the Google Ads API. Use it to obtain refresh tokens and fetch daily spend, campaign/ad group performance, keywords, locations, devices, impressions, clicks, CPC, and conversions.

## Prerequisites
- Node.js 18+ and npm 9+
- A Google Ads manager account with API access
- Google Cloud project where the Google Ads API is enabled

## Installation
```bash
cd backend
npm install
cp env.example .env
```
Fill `.env` with the credentials gathered below.

## Required Environment Variables
| Key | Description | How to Obtain |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 client ID | Create a Web OAuth client in Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 client secret | Same as above; download JSON and copy secret |
| `GOOGLE_DEVELOPER_TOKEN` | Google Ads API developer token | Google Ads UI → Tools & Settings → API Center |
| `GOOGLE_OAUTH_REDIRECT_URI` | Redirect URI registered with OAuth client | Must match the URI used by your frontend |
| `GOOGLE_LOGIN_CUSTOMER_ID` | Manager account ID used to access child accounts | Found in Google Ads UI (strip dashes) |


### 1. Enable Google Ads API and OAuth
1. Visit [Google Cloud Console](https://console.cloud.google.com/).
2. Select or create a project.
3. Go to **APIs & Services → Library**, enable **Google Ads API**.
4. In **OAuth consent screen**, configure scopes (add `https://www.googleapis.com/auth/adwords`) and publish the app (at least to test).
5. In **Credentials → Create Credentials → OAuth client ID**, choose **Web application**.
6. Add your frontend origin(s) to **Authorized JavaScript origins** and `http://localhost:4000/auth/callback` (or equivalent) to **Authorized redirect URIs**.
7. Copy the generated client ID and secret into `.env`.

### 2. Get a Google Ads Developer Token
1. Open the Google Ads manager account tied to your API usage.
2. Go to **Tools & Settings → Setup → API Center**.
3. Request a developer token (takes time for production approval).
4. Copy the token into `.env` as `GOOGLE_DEVELOPER_TOKEN`.

### 3. Determine Login/Customer IDs
- **Login customer ID**: the manager account that has API access (visible in the Google Ads UI header). Store without dashes.
- **Customer ID**: the account you want to report on; you’ll pass it per-request in the metrics endpoint body, also without dashes.

## Running the Server
```bash
cd backend
npm start
```
The server listens on `http://HOST:PORT` (defaults `0.0.0.0:4000`).

## OAuth Flow
1. Frontend hits `GET /auth/url?state=optionalState`. The backend returns a Google OAuth URL.
2. Redirect the user to that URL. After consent, Google redirects to your `GOOGLE_OAUTH_REDIRECT_URI` with a `code` query parameter.
3. Send that code to `POST /auth/exchange` with JSON:
   ```json
   { "code": "AUTH_CODE_FROM_GOOGLE" }
   ```
4. The response includes `refreshToken`, `accessToken`, and metadata. Persist the refresh token securely (DB, secrets manager, etc.).

> **Important**: The backend forces `access_type=offline` and `prompt=consent` so Google returns a refresh token. If Google still omits it, revoke the app access in the user’s Google account and repeat consent.

## Fetching Metrics
Endpoint: `POST /google-ads/metrics`

Example payload:
```json
{
  "customerId": "1234567890",
  "loginCustomerId": "0987654321",
  "refreshToken": "ya29.a0Af...",
  "dateRange": { "preset": "LAST_30_DAYS" }
}
```

### Date Range Options
- Presets: `LAST_7_DAYS`, `LAST_30_DAYS`, `LAST_90_DAYS`, `THIS_WEEK`, `LAST_MONTH`, `TODAY`, `YESTERDAY`, `ALL_TIME`, etc.
- Custom: `{ "startDate": "2024-11-01", "endDate": "2024-11-25" }` (ISO `YYYY-MM-DD`).

### Response Fields
- `dailySpend`: per-day cost, impressions, clicks, conversions.
- `campaignPerformance`: status, spend, impressions, clicks, conversions, average CPC.
- `adGroups`, `keywords`, `locations`, `devices`: similar metrics scoped by entity.
- `totals`: aggregated cost, impressions, clicks, conversions, `averageCpc`.

## Testing the Endpoints
```bash
# Health check
curl http://localhost:4000/health

# Auth URL
curl "http://localhost:4000/auth/url?state=demo"

# Exchange code
curl -X POST http://localhost:4000/auth/exchange \
  -H "Content-Type: application/json" \
  -d '{"code":"paste-code-here"}'

# Fetch metrics (after storing refresh token)
curl -X POST http://localhost:4000/google-ads/metrics \
  -H "Content-Type: application/json" \
  -d '{
    "customerId":"1234567890",
    "refreshToken":"stored-refresh-token",
    "dateRange":{"preset":"LAST_7_DAYS"}
  }'
```

## Required Google Ads Settings Recap
- OAuth consent screen configured and published.
- OAuth client configured with the backend redirect URI.
- Developer token approved (test vs production depending on your use case).
- Login customer granted API access and linked to target customer accounts.
- Appropriate user permissions to authorize the app during OAuth.

With these steps complete, you can issue OAuth logins, capture refresh tokens, and request the full analytics payload from the Google Ads API through this backend.

