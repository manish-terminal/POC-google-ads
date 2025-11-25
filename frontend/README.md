# Google Ads Frontend

This Vite + React dashboard drives the OAuth flow exposed by the backend, exchanges Google authorization codes for refresh tokens, and renders Google Ads performance (daily spend, campaigns, ad groups, keywords, locations, devices).

## Getting Started
```bash
cd frontend
npm install
cp env.example .env
```

Set `VITE_API_BASE_URL` in `.env` to the backend host (`http://localhost:4000` by default).

### Available Scripts
- `npm run dev` – start Vite dev server (use `-- --host` to allow LAN access)
- `npm run build` – production build
- `npm run preview` – preview production output locally

## OAuth + Metrics Flow
1. **Authorize:** Click “Sign in with Google”. The frontend asks the backend for `/auth/url`, then redirects the browser to Google with the correct scope/state.  
2. **Exchange:** Google redirects back to the frontend (make sure this origin is registered as an OAuth redirect URI). The app detects `?code=...` and calls `/auth/exchange`, storing the returned `refreshToken` in `localStorage`.  
3. **Fetch metrics:** Enter a `customerId`, optional `loginCustomerId`, choose a date preset or custom range, and click “Fetch metrics” to call `/google-ads/metrics`.

The UI keeps the latest refresh token/customer IDs in `localStorage` so you can refresh the page without losing state. Use “Clear session” at any time to wipe local storage and metrics.

## Environment Variables
| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:4000` | URL of the backend created in `backend/` |

> Remember to restart `npm run dev` whenever `.env` changes.

## Expected Backend Settings
Make sure the backend `.env` is populated with valid `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DEVELOPER_TOKEN`, and that OAuth redirect URIs include your frontend origin (e.g., `http://localhost:5173`). The frontend automatically posts `redirectUri: window.location.origin` during the code exchange.

With both services running:
1. `cd backend && npm start`
2. `cd frontend && npm run dev`
3. Visit the printed Vite URL (default `http://localhost:5173`) and walk through the flow.
