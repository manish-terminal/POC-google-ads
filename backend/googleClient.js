const { GoogleAdsApi } = require("google-ads-api");
const dotenv = require("dotenv");

dotenv.config();

const REQUIRED_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_DEVELOPER_TOKEN",
];

const missingKeys = REQUIRED_KEYS.filter((key) => !process.env[key]);

if (missingKeys.length) {
  throw new Error(
    `Missing Google Ads configuration. Please set: ${missingKeys.join(", ")}`
  );
}

const client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
});

module.exports = { client };
