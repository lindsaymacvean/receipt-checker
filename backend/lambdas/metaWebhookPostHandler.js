// Slim WhatsApp → azure → WhatsApp proxy
// Receives WhatsApp text via Meta webhook, forwards to Azure Function,
// then sends the reply back to the WhatsApp sender.

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const secretsClient = new SecretsManagerClient();

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v17.0';
const AZURE_FUNCTION_URL = process.env.AZURE_FUNCTION_URL; // e.g. https://<app>.azurewebsites.net/api/chat
const AZURE_FUNCTION_API_KEY = process.env.AZURE_FUNCTION_API_KEY; // optional
const META_ACCESS_TOKEN_ENV = process.env.META_ACCESS_TOKEN; // optional; fallback to Secrets Manager if absent
const META_SECRET_ID = process.env.META_SECRET_ID;           // if using Secrets Manager for token

async function getMetaAccessToken() {
  if (META_ACCESS_TOKEN_ENV) return META_ACCESS_TOKEN_ENV;
  if (!META_SECRET_ID) throw new Error('META_ACCESS_TOKEN not set and META_SECRET_ID missing');
  const sec = await secretsClient.send(new GetSecretValueCommand({ SecretId: META_SECRET_ID }));
  const metaSecret = JSON.parse(sec.SecretString || '{}');
  if (!metaSecret.access_token) throw new Error('META secret missing access_token');
  return metaSecret.access_token;
}

function extractWhatsAppBits(body) {
  const entry0 = body.entry?.[0];
  const change0 = entry0?.changes?.[0];
  const value = change0?.value || {};
  const messages = value.messages || [];
  const msg = messages[0] || {};
  const waId = value.contacts?.[0]?.wa_id;
  const phoneNumberId = value.metadata?.phone_number_id;

  const isText = msg.type === 'text' || (msg.text && (typeof msg.text === 'string' || typeof msg.text?.body === 'string'));
  const userText = isText ? (typeof msg.text === 'string' ? msg.text : (msg.text?.body || '')) : '';

  return { waId, phoneNumberId, userText, isText };
}

async function sendWhatsAppText({ phoneNumberId, to, text, accessToken }) {
  if (!phoneNumberId) throw new Error('Missing phoneNumberId');
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}/messages`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      text: { body: text }
    })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`WhatsApp send failed: ${resp.status} ${resp.statusText} ${JSON.stringify(data)}`);
  }
  return data;
}

async function callFunction({ userMessage, waId }) {
  if (!AZURE_FUNCTION_URL) throw new Error('AZURE_FUNCTION_URL not configured');
  const headers = { 'Content-Type': 'application/json' };
  if (AZURE_FUNCTION_API_KEY) headers['Authorization'] = `Bearer ${AZURE_FUNCTION_API_KEY}`;
  const resp = await fetch(AZURE_FUNCTION_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ user_message: userMessage, waId })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Function error: ${resp.status} ${resp.statusText} ${JSON.stringify(data)}`);
  }
  // Normalise possible shapes
  const replyText = JSON.stringify(data).ai_response_chunk;
  return replyText;
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    console.log('Incoming webhook:', JSON.stringify(body, null, 2));

    const { waId, phoneNumberId, userText, isText } = extractWhatsAppBits(body);
    if (!waId || !phoneNumberId) {
      console.warn('Missing waId or phoneNumberId — ignoring');
      return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ message: 'Ignored (no waId/phoneNumberId)' }) };
    }

    if (!isText || !userText) {
      console.log('Non-text or empty message — ignoring');
      return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ message: 'Ignored (non-text/empty)' }) };
    }

    // 1) Call Azure Function with the user text
    let reply;
    try {
      reply = await callFunction({ userMessage: userText, waId });
    } catch (e) {
      console.error('call failed:', e);
      reply = 'Sorry — my help service is unavailable right now. Please try again shortly.';
    }

    // 2) Send reply back to WhatsApp
    const accessToken = await getMetaAccessToken();
    await sendWhatsAppText({ phoneNumberId, to: waId, text: reply, accessToken });

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ message: 'Reply sent' })
    };
  } catch (err) {
    console.error('Webhook handler error:', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Internal error' })
    };
  }
};