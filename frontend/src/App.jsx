import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const DATE_PRESETS = [
  { value: "LAST_7_DAYS", label: "Last 7 days" },
  { value: "LAST_30_DAYS", label: "Last 30 days" },
  { value: "LAST_90_DAYS", label: "Last 90 days" },
  { value: "THIS_MONTH", label: "This month" },
  { value: "LAST_MONTH", label: "Last month" },
  { value: "ALL_TIME", label: "All time" },
  { value: "CUSTOM", label: "Custom range" },
];

const STORAGE_KEYS = {
  refreshToken: "googleAdsRefreshToken",
  customerId: "googleAdsCustomerId",
  loginCustomerId: "googleAdsLoginCustomerId",
  oauthState: "googleAdsOauthState",
};

const getStoredValue = (key) =>
  typeof window !== "undefined" ? localStorage.getItem(key) || "" : "";

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatNumber = (value) =>
  Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });

const SummaryCard = ({ title, value, subtext }) => (
  <div className="summary-card">
    <p className="summary-label">{title}</p>
    <p className="summary-value">{value}</p>
    {subtext && <p className="summary-subtext">{subtext}</p>}
  </div>
);

const MetricsTable = ({ title, rows = [], columns, emptyLabel }) => (
  <div className="panel table-card">
    <div className="panel-header">
      <h3>{title}</h3>
      <span className="panel-count">{rows.length} rows</span>
    </div>
    <div className="table-wrapper">
      {rows.length ? (
        <table>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.id || row.date || row.device || index}`}>
                {columns.map((col) => (
                  <td key={col.key}>
                    {typeof col.format === "function"
                      ? col.format(row[col.key], row)
                      : row[col.key] ?? "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">{emptyLabel || "No data yet."}</div>
      )}
    </div>
  </div>
);

const Alert = ({ status }) => {
  if (!status) return null;
  return <div className={`alert ${status.type}`}>{status.message}</div>;
};

const createStateToken = () => {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

const removeOAuthQueryParams = () => {
  const url = new URL(window.location.href);
  ["code", "scope", "state", "authuser", "prompt"].forEach((param) =>
    url.searchParams.delete(param)
  );
  const newQuery = url.searchParams.toString();
  const newUrl = `${url.pathname}${newQuery ? `?${newQuery}` : ""}${url.hash}`;
  window.history.replaceState({}, document.title, newUrl);
};

function App() {
  const [customerId, setCustomerId] = useState(() =>
    getStoredValue(STORAGE_KEYS.customerId)
  );
  const [loginCustomerId, setLoginCustomerId] = useState(() =>
    getStoredValue(STORAGE_KEYS.loginCustomerId)
  );
  const [refreshToken, setRefreshToken] = useState(() =>
    getStoredValue(STORAGE_KEYS.refreshToken)
  );
  const [datePreset, setDatePreset] = useState("LAST_30_DAYS");
  const [customRange, setCustomRange] = useState({
    startDate: "",
    endDate: "",
  });
  const [status, setStatus] = useState(null);
  const [authStatus, setAuthStatus] = useState("idle");
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const processedCodeRef = useRef(false);

  const dailySpendAscending = useMemo(() => {
    if (!metrics?.dailySpend) return [];
    return [...metrics.dailySpend].sort((a, b) =>
      a.date > b.date ? 1 : -1
    );
  }, [metrics]);

  const dateRangeDescription =
    datePreset === "CUSTOM"
      ? `${customRange.startDate || "??"} → ${customRange.endDate || "??"}`
      : DATE_PRESETS.find((item) => item.value === datePreset)?.label ||
        datePreset;

  const persistValue = (key, value) => {
    if (typeof window === "undefined") return;
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  };

  useEffect(() => {
    persistValue(STORAGE_KEYS.customerId, customerId);
  }, [customerId]);

  useEffect(() => {
    persistValue(STORAGE_KEYS.loginCustomerId, loginCustomerId);
  }, [loginCustomerId]);

  useEffect(() => {
    persistValue(STORAGE_KEYS.refreshToken, refreshToken);
  }, [refreshToken]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const returnedState = params.get("state");
    if (!code || processedCodeRef.current) return;
    processedCodeRef.current = true;
    exchangeAuthorizationCode(code, returnedState);
  }, []);

  const exchangeAuthorizationCode = async (code, returnedState) => {
    setAuthStatus("exchanging");
    setStatus(null);
    try {
      const savedState = localStorage.getItem(STORAGE_KEYS.oauthState);
      if (savedState && returnedState && savedState !== returnedState) {
        throw new Error("State mismatch. Restart the sign-in flow.");
      }

      const response = await fetch(`${API_BASE_URL}/auth/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          redirectUri: window.location.origin,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to exchange code.");
      }

      if (!payload.refreshToken) {
        throw new Error(
          "Refresh token missing in response. Ensure offline access is granted."
        );
      }

      setRefreshToken(payload.refreshToken);
      setStatus({
        type: "success",
        message: "Authorization complete. Refresh token stored locally.",
      });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setAuthStatus("idle");
      localStorage.removeItem(STORAGE_KEYS.oauthState);
      removeOAuthQueryParams();
    }
  };

  const handleStartOAuth = async () => {
    setAuthStatus("loading");
    setStatus(null);
    try {
      const state = createStateToken();
      localStorage.setItem(STORAGE_KEYS.oauthState, state);
      const url = new URL(`${API_BASE_URL}/auth/url`);
      url.searchParams.set("state", state);

      const response = await fetch(url, {
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.url) {
        throw new Error(payload?.error || "Unable to start OAuth flow.");
      }
      window.location.href = payload.url;
    } catch (error) {
      setAuthStatus("idle");
      setStatus({ type: "error", message: error.message });
    }
  };

  const handleFetchMetrics = async () => {
    setStatus(null);
    if (!customerId) {
      setStatus({ type: "error", message: "Customer ID is required." });
      return;
    }
    if (!refreshToken) {
      setStatus({ type: "error", message: "Refresh token is required." });
      return;
    }
    if (
      datePreset === "CUSTOM" &&
      (!customRange.startDate || !customRange.endDate)
    ) {
      setStatus({
        type: "error",
        message: "Select both start and end dates for a custom range.",
      });
      return;
    }

    setMetricsLoading(true);
    try {
      const payload = {
        customerId,
        loginCustomerId: loginCustomerId || undefined,
        refreshToken,
        dateRange:
          datePreset === "CUSTOM"
            ? {
                startDate: customRange.startDate,
                endDate: customRange.endDate,
              }
            : { preset: datePreset },
      };

      const response = await fetch(`${API_BASE_URL}/google-ads/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Failed to fetch metrics.");
      }

      setMetrics(data);
      setLastRefresh(new Date().toISOString());
      setStatus({
        type: "success",
        message: "Metrics updated.",
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message,
      });
    } finally {
      setMetricsLoading(false);
    }
  };

  const handleClearSession = () => {
    setCustomerId("");
    setLoginCustomerId("");
    setRefreshToken("");
    setMetrics(null);
    setLastRefresh(null);
    setStatus({ type: "success", message: "Local session cleared." });
  };

  return (
    <div className="app">
      <header>
        <p className="eyebrow">Google Ads Toolkit</p>
        <h1>Connect, authorize, and inspect campaign performance</h1>
        <p className="lede">
          Use the backend OAuth helpers to capture a refresh token, then pull
          spend, clicks, conversions, keywords, devices, and more without
          leaving this dashboard.
        </p>
        <div className="env-pill">
          Backend: <strong>{API_BASE_URL}</strong>
        </div>
      </header>

      <Alert status={status} />

      <section className="panel grid">
        <div>
          <h2>1. Authorize Google Ads</h2>
          <p className="panel-text">
            The backend will open Google&apos;s consent screen with
            <code>https://www.googleapis.com/auth/adwords</code>. Once Google
            redirects back to this origin, the code is exchanged automatically.
          </p>
          <div className="button-row">
            <button
              className="btn primary"
              onClick={handleStartOAuth}
              disabled={authStatus !== "idle"}
            >
              {authStatus === "loading" ? "Opening..." : "Sign in with Google"}
            </button>
            <button className="btn ghost" onClick={handleClearSession}>
              Clear session
            </button>
          </div>
          <ul className="list">
            <li>Ensure this origin is added as an OAuth redirect URI.</li>
            <li>
              Google may require manual removal of prior access if a refresh
              token is not returned.
            </li>
          </ul>
        </div>
        <div className="session-card">
          <h3>Current session</h3>
          <dl>
            <div>
              <dt>Refresh token</dt>
              <dd>
                {refreshToken
                  ? `${refreshToken.slice(0, 8)}•••${refreshToken.slice(-4)}`
                  : "Not stored"}
              </dd>
            </div>
            <div>
              <dt>Customer ID</dt>
              <dd>{customerId || "Not provided"}</dd>
            </div>
            <div>
              <dt>Login customer ID</dt>
              <dd>{loginCustomerId || "Optional"}</dd>
            </div>
            <div>
              <dt>Last metrics pull</dt>
              <dd>
                {lastRefresh
                  ? new Date(lastRefresh).toLocaleString()
                  : "Not yet fetched"}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="panel">
        <h2>2. Choose customer and date range</h2>
        <div className="form-grid">
          <label className="input-group">
            <span>Customer ID *</span>
            <input
              type="text"
              placeholder="1234567890"
              value={customerId}
              onChange={(event) =>
                setCustomerId(event.target.value.replace(/[^0-9-]/g, ""))
              }
            />
          </label>
          <label className="input-group">
            <span>Login customer ID</span>
            <input
              type="text"
              placeholder="Manager account ID (optional)"
              value={loginCustomerId}
              onChange={(event) =>
                setLoginCustomerId(event.target.value.replace(/[^0-9-]/g, ""))
              }
            />
          </label>
          <label className="input-group">
            <span>Date preset</span>
            <select
              value={datePreset}
              onChange={(event) => setDatePreset(event.target.value)}
            >
              {DATE_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          {datePreset === "CUSTOM" && (
            <>
              <label className="input-group">
                <span>Start date</span>
                <input
                  type="date"
                  value={customRange.startDate}
                  onChange={(event) =>
                    setCustomRange((prev) => ({
                      ...prev,
                      startDate: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="input-group">
                <span>End date</span>
                <input
                  type="date"
                  value={customRange.endDate}
                  onChange={(event) =>
                    setCustomRange((prev) => ({
                      ...prev,
                      endDate: event.target.value,
                    }))
                  }
                />
              </label>
            </>
          )}
        </div>
        <div className="metrics-controls">
          <div>
            <p className="muted">
              Requests use the stored refresh token and are proxied through the
              backend. Selected range: <strong>{dateRangeDescription}</strong>
            </p>
          </div>
          <button
            className="btn primary"
            onClick={handleFetchMetrics}
            disabled={metricsLoading}
          >
            {metricsLoading ? "Fetching metrics..." : "Fetch metrics"}
          </button>
        </div>
      </section>

      {metrics && (
        <>
          <section className="panel">
            <h2>3. Results overview</h2>
            <div className="summary-grid">
              <SummaryCard
                title="Total spend"
                value={formatCurrency(metrics.totals?.cost)}
                subtext="Converted from micros"
              />
              <SummaryCard
                title="Impressions"
                value={formatNumber(metrics.totals?.impressions)}
              />
              <SummaryCard
                title="Clicks"
                value={formatNumber(metrics.totals?.clicks)}
              />
              <SummaryCard
                title="Conversions"
                value={formatNumber(metrics.totals?.conversions)}
              />
              <SummaryCard
                title="Avg CPC"
                value={formatCurrency(metrics.totals?.averageCpc)}
              />
            </div>
          </section>

          <div className="grid">
            <MetricsTable
              title="Daily spending"
              rows={dailySpendAscending}
              emptyLabel="No spend data for the selected range."
              columns={[
                { key: "date", label: "Date" },
                {
                  key: "cost",
                  label: "Cost",
                  format: formatCurrency,
                },
                {
                  key: "impressions",
                  label: "Impressions",
                  format: formatNumber,
                },
                {
                  key: "clicks",
                  label: "Clicks",
                  format: formatNumber,
                },
                {
                  key: "conversions",
                  label: "Conversions",
                  format: formatNumber,
                },
              ]}
            />

            <MetricsTable
              title="Campaign performance"
              rows={metrics.campaignPerformance}
              emptyLabel="No campaigns returned."
              columns={[
                { key: "name", label: "Campaign" },
                {
                  key: "status",
                  label: "Status",
                  format: (value) => (
                    <span className={`badge status-${value?.toLowerCase()}`}>
                      {value || "N/A"}
                    </span>
                  ),
                },
                { key: "impressions", label: "Impressions", format: formatNumber },
                { key: "clicks", label: "Clicks", format: formatNumber },
                { key: "conversions", label: "Conversions", format: formatNumber },
                { key: "cost", label: "Cost", format: formatCurrency },
                { key: "averageCpc", label: "Avg CPC", format: formatCurrency },
              ]}
            />
          </div>

          <div className="grid">
            <MetricsTable
              title="Ad groups"
              rows={metrics.adGroups}
              emptyLabel="No ad groups for this period."
              columns={[
                { key: "name", label: "Ad group" },
                { key: "campaignName", label: "Campaign" },
                { key: "impressions", label: "Impressions", format: formatNumber },
                { key: "clicks", label: "Clicks", format: formatNumber },
                { key: "conversions", label: "Conversions", format: formatNumber },
                { key: "cost", label: "Cost", format: formatCurrency },
              ]}
            />

            <MetricsTable
              title="Top keywords"
              rows={metrics.keywords}
              emptyLabel="No keyword metrics returned."
              columns={[
                { key: "text", label: "Keyword" },
                { key: "matchType", label: "Match" },
                { key: "adGroupName", label: "Ad group" },
                { key: "campaignName", label: "Campaign" },
                { key: "impressions", label: "Impressions", format: formatNumber },
                { key: "clicks", label: "Clicks", format: formatNumber },
                { key: "conversions", label: "Conversions", format: formatNumber },
                { key: "cost", label: "Cost", format: formatCurrency },
                { key: "averageCpc", label: "Avg CPC", format: formatCurrency },
              ]}
            />
          </div>

          <div className="grid">
            <MetricsTable
              title="Locations"
              rows={metrics.locations}
              emptyLabel="No geography data."
              columns={[
                {
                  key: "city",
                  label: "City",
                  format: (value, row) =>
                    value || row.region || row.country || "Unknown",
                },
                {
                  key: "region",
                  label: "Region",
                },
                {
                  key: "country",
                  label: "Country",
                },
                { key: "impressions", label: "Impressions", format: formatNumber },
                { key: "clicks", label: "Clicks", format: formatNumber },
                { key: "conversions", label: "Conversions", format: formatNumber },
                { key: "cost", label: "Cost", format: formatCurrency },
              ]}
            />

            <MetricsTable
              title="Devices"
              rows={metrics.devices}
              emptyLabel="No device mix for this range."
              columns={[
                { key: "device", label: "Device" },
                { key: "impressions", label: "Impressions", format: formatNumber },
                { key: "clicks", label: "Clicks", format: formatNumber },
                { key: "conversions", label: "Conversions", format: formatNumber },
                { key: "cost", label: "Cost", format: formatCurrency },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default App;
