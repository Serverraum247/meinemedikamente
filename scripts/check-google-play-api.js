#!/usr/bin/env node

const fs = require('fs');
const crypto = require('crypto');

const packageName = process.env.GOOGLE_PLAY_PACKAGE || 'dev.serverraum247.meinmediplan';
const keyFile =
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ||
  '/Users/danielbrussig/.config/mein-mediplan/google-play-service-account.json';

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function loadKey() {
  if (!fs.existsSync(keyFile)) {
    throw new Error(`Service account key file not found: ${keyFile}`);
  }
  return JSON.parse(fs.readFileSync(keyFile, 'utf8'));
}

async function getAccessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const header = {alg: 'RS256', typ: 'JWT'};
  const claim = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), key.private_key);
  const assertion = `${unsigned}.${base64url(signature)}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Token request failed (${response.status}): ${body.error_description || body.error}`);
  }
  return body.access_token;
}

async function callPublisherApi(token, method, path) {
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}${path}`,
    {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
    },
  );
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Android Publisher API failed (${response.status}): ${body.error?.message || text}`);
  }
  return body;
}

async function main() {
  const key = loadKey();
  const token = await getAccessToken(key);
  let editId;

  try {
    const edit = await callPublisherApi(token, 'POST', '/edits');
    editId = edit.id;
    const listings = await callPublisherApi(token, 'GET', `/edits/${editId}/listings`);
    const languages = (listings.listings || []).map(entry => entry.language).filter(Boolean);

    console.log(`Google Play API OK for ${packageName}`);
    console.log(`Store listings: ${languages.length ? languages.join(', ') : 'none'}`);
  } finally {
    if (editId) {
      await callPublisherApi(token, 'DELETE', `/edits/${editId}`).catch(() => {});
    }
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
