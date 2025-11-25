const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { OAuth2Client } = require("google-auth-library");
const { client } = require("./googleClient");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "0.0.0.0";
const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/adwords"];

const REQUIRED_SERVER_ENV = ["GOOGLE_OAUTH_REDIRECT_URI"];
const missingServerEnv = REQUIRED_SERVER_ENV.filter((key) => !process.env[key]);

if (missingServerEnv.length) {
  throw new Error(
    `Missing OAuth configuration. Please set: ${missingServerEnv.join(", ")}`
  );
}

const oauthClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_OAUTH_REDIRECT_URI
);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : undefined;

app.use(
  cors({
    origin: allowedOrigins || true,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

const isValidDate = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

const sanitizeCustomerId = (id = "") =>
  id.toString().replace(/[^0-9]/g, "");

const numberOrZero = (value) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;

const microsToCurrency = (value) => {
  const micros = numberOrZero(value);
  return Number((micros / 1_000_000).toFixed(6));
};

const buildDateClause = (dateRange = {}) => {
  const preset = dateRange.preset?.toUpperCase();
  if (
    preset &&
    /^LAST_\d+_DAYS$|^THIS_\w+$|^LAST_\w+$|^TODAY$|^YESTERDAY$|^ALL_TIME$/.test(
      preset
    )
  ) {
    return `segments.date DURING ${preset}`;
  }

  if (isValidDate(dateRange.startDate) && isValidDate(dateRange.endDate)) {
    return `segments.date BETWEEN '${dateRange.startDate}' AND '${dateRange.endDate}'`;
  }

  return "segments.date DURING LAST_30_DAYS";
};

const queries = (dateClause) => ({
  dailySpend: `
    SELECT
      segments.date,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions
    FROM customer
    WHERE ${dateClause}
    ORDER BY segments.date DESC
    LIMIT 30
  `,
  campaignPerformance: `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.average_cpc
    FROM campaign
    WHERE ${dateClause}
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 50
  `,
  adGroups: `
    SELECT
      ad_group.id,
      ad_group.name,
      campaign.id,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM ad_group
    WHERE ${dateClause}
      AND ad_group.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 75
  `,
  keywords: `
    SELECT
      ad_group.id,
      ad_group.name,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      campaign.id,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.average_cpc
    FROM keyword_view
    WHERE ${dateClause}
      AND ad_group_criterion.status != 'REMOVED'
    ORDER BY metrics.clicks DESC
    LIMIT 100
  `,
  locations: `
    SELECT
      segments.geo_target_country,
      segments.geo_target_region,
      segments.geo_target_city,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    WHERE ${dateClause}
    ORDER BY metrics.clicks DESC
    LIMIT 100
  `,
  devices: `
    SELECT
      segments.device,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    WHERE ${dateClause}
    ORDER BY metrics.clicks DESC
  `,
});

const formatDailySpend = (rows) =>
  rows.map((row) => ({
    date: row.segments?.date,
    cost: microsToCurrency(row.metrics?.costMicros),
    impressions: numberOrZero(row.metrics?.impressions),
    clicks: numberOrZero(row.metrics?.clicks),
    conversions: numberOrZero(row.metrics?.conversions),
  }));

const formatCampaigns = (rows) =>
  rows.map((row) => ({
    id: row.campaign?.id,
    name: row.campaign?.name,
    status: row.campaign?.status,
    cost: microsToCurrency(row.metrics?.costMicros),
    impressions: numberOrZero(row.metrics?.impressions),
    clicks: numberOrZero(row.metrics?.clicks),
    conversions: numberOrZero(row.metrics?.conversions),
    averageCpc: microsToCurrency(row.metrics?.averageCpc),
  }));

const formatAdGroups = (rows) =>
  rows.map((row) => ({
    id: row.adGroup?.id,
    name: row.adGroup?.name,
    campaignId: row.campaign?.id,
    campaignName: row.campaign?.name,
    cost: microsToCurrency(row.metrics?.costMicros),
    impressions: numberOrZero(row.metrics?.impressions),
    clicks: numberOrZero(row.metrics?.clicks),
    conversions: numberOrZero(row.metrics?.conversions),
  }));

const formatKeywords = (rows) =>
  rows.map((row) => ({
    adGroupId: row.adGroup?.id,
    adGroupName: row.adGroup?.name,
    campaignId: row.campaign?.id,
    campaignName: row.campaign?.name,
    text: row.adGroupCriterion?.keyword?.text,
    matchType: row.adGroupCriterion?.keyword?.matchType,
    impressions: numberOrZero(row.metrics?.impressions),
    clicks: numberOrZero(row.metrics?.clicks),
    cost: microsToCurrency(row.metrics?.costMicros),
    conversions: numberOrZero(row.metrics?.conversions),
    averageCpc: microsToCurrency(row.metrics?.averageCpc),
  }));

const formatLocations = (rows) =>
  rows.map((row) => ({
    country: row.segments?.geoTargetCountry,
    region: row.segments?.geoTargetRegion,
    city: row.segments?.geoTargetCity,
    impressions: numberOrZero(row.metrics?.impressions),
    clicks: numberOrZero(row.metrics?.clicks),
    cost: microsToCurrency(row.metrics?.costMicros),
    conversions: numberOrZero(row.metrics?.conversions),
  }));

const formatDevices = (rows) =>
  rows.map((row) => ({
    device: row.segments?.device,
    impressions: numberOrZero(row.metrics?.impressions),
    clicks: numberOrZero(row.metrics?.clicks),
    cost: microsToCurrency(row.metrics?.costMicros),
    conversions: numberOrZero(row.metrics?.conversions),
  }));

const mapResults = (raw) => {
  const dailySpend = formatDailySpend(raw.dailySpend || []);
  const totals = dailySpend.reduce(
    (acc, day) => ({
      cost: acc.cost + day.cost,
      impressions: acc.impressions + day.impressions,
      clicks: acc.clicks + day.clicks,
      conversions: acc.conversions + day.conversions,
    }),
    { cost: 0, impressions: 0, clicks: 0, conversions: 0 }
  );

  const averageCpc =
    totals.clicks > 0 ? Number((totals.cost / totals.clicks).toFixed(6)) : 0;

  return {
    dailySpend,
    campaignPerformance: formatCampaigns(raw.campaignPerformance || []),
    adGroups: formatAdGroups(raw.adGroups || []),
    keywords: formatKeywords(raw.keywords || []),
    locations: formatLocations(raw.locations || []),
    devices: formatDevices(raw.devices || []),
    totals: { ...totals, averageCpc },
  };
};

const fetchReports = async (customer, dateClause) => {
  const builtQueries = queries(dateClause);
  const entries = await Promise.all(
    Object.entries(builtQueries).map(async ([key, query]) => {
      const rows = await customer.query(query);
      return [key, rows];
    })
  );

  return Object.fromEntries(entries);
};

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/auth/url", (req, res) => {
  const { state } = req.query;

  const url = oauthClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state: state || undefined,
  });

  res.json({ url });
});

app.post("/auth/exchange", async (req, res) => {
  const { code, redirectUri } = req.body || {};

  if (!code) {
    return res
      .status(400)
      .json({ error: "Missing authorization code from Google OAuth." });
  }

  try {
    const { tokens } = await oauthClient.getToken({
      code,
      redirect_uri: redirectUri || process.env.GOOGLE_OAUTH_REDIRECT_URI,
    });

    if (!tokens.refresh_token) {
      return res.status(400).json({
        error:
          "Google did not return a refresh_token. Ensure 'prompt=consent' and 'access_type=offline'.",
      });
    }

    res.json({
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiryDate: tokens.expiry_date,
      scope: tokens.scope,
      tokenType: tokens.token_type,
    });
  } catch (error) {
    console.error("Failed to exchange OAuth code:", error.message);
    res.status(500).json({
      error: "Failed to exchange authorization code.",
      details: error.message,
    });
  }
});

app.post("/google-ads/metrics", async (req, res) => {
  const {
    customerId,
    loginCustomerId = process.env.GOOGLE_LOGIN_CUSTOMER_ID,
    refreshToken,
    dateRange,
  } = req.body || {};

  if (!customerId) {
    return res.status(400).json({ error: "customerId is required." });
  }

  if (!refreshToken) {
    return res.status(400).json({ error: "refreshToken is required." });
  }

  const sanitizedCustomerId = sanitizeCustomerId(customerId);
  const sanitizedLoginCustomerId = loginCustomerId
    ? sanitizeCustomerId(loginCustomerId)
    : undefined;

  try {
    const customer = client.Customer({
      customer_id: sanitizedCustomerId,
      login_customer_id: sanitizedLoginCustomerId,
      refresh_token: refreshToken,
    });

    const dateClause = buildDateClause(dateRange);
    const rawReports = await fetchReports(customer, dateClause);
    const payload = mapResults(rawReports);

    res.json({
      customerId: sanitizedCustomerId,
      loginCustomerId: sanitizedLoginCustomerId,
      dateClause,
      ...payload,
    });
  } catch (error) {
    console.error("Google Ads metrics error:", error.message);
    res.status(500).json({
      error: "Unable to fetch Google Ads metrics.",
      details: error.message,
    });
  }
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
  });
}

module.exports = { app };
