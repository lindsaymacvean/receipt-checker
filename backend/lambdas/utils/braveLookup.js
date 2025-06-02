const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
// Pure Brave API lookup, no prompt logic here

// Brave Search API endpoint
const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search';

// Secrets Manager client and secret identifier for Brave API key
const secretsClient = new SecretsManagerClient();
const braveSecretId = process.env.BRAVE_SECRET_ID;

// Retrieve and cache the Brave API key from Secrets Manager
async function getBraveApiKey() {
  if (getBraveApiKey.cached) return getBraveApiKey.cached;
  if (!braveSecretId) {
    throw new Error('Missing BRAVE_SECRET_ID environment variable');
  }
  const resp = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: braveSecretId })
  );
  const data = JSON.parse(resp.SecretString || '{}');
  const key = data.brave_api_key;
  if (!key) throw new Error('Missing brave_api_key in BraveSecrets');
  getBraveApiKey.cached = key;
  return key;
}

// Score a search result based on domain and title matching
function scoreResult(result, merchant) {
  let score = 0;
  const domain = result.url || '';
  const title = (result.title || '').toLowerCase();
  const m = merchant.toLowerCase();
  if (domain.includes(m)) score += 2;
  if (title.includes(m)) score += 1;
  if (domain.includes('.com')) score += 1;
  return score;
}

// Perform a Brave search for the merchant name
async function searchBrave(merchant) {
  const apiKey = await getBraveApiKey();
  const url = `${BRAVE_API_URL}?q=${encodeURIComponent(merchant)}`;
  const resp = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey
    }
  });
  if (!resp.ok) throw new Error(`Brave search failed: ${resp.statusText}`);
  const json = await resp.json();
  // Log count of returned results (avoid full verbose dump)
  const resultCount = Array.isArray(json.web?.results) ? json.web.results.length : 0;
  console.log(`[BraveLookup] searchBrave: merchant="${merchant}" returned ${resultCount} results`);
  return Array.isArray(json.web?.results) ? json.web.results : [];
}

// Lookup merchant info: pick best-scoring result
async function lookupMerchantInfo(merchant) {
  const results = await searchBrave(merchant);
  console.log(`[BraveLookup] lookupMerchantInfo: merchant="${merchant}", ${results.length} results`);
  if (results.length === 0) {
    console.log(`[BraveLookup] lookupMerchantInfo: no results for merchant "${merchant}"`);
    return null;
  }
  const scored = results.map(r => ({ ...r, score: scoreResult(r, merchant) }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  // Log key parts of the best result
  console.log(
    `[BraveLookup] lookupMerchantInfo: best match for "${merchant}"`,
    { url: best.url, title: best.title, description: best.description, score: best.score }
  );
  return {
    url: best.url,
    title: best.title,
    description: best.description || ''
  };
}


module.exports = { lookupMerchantInfo };