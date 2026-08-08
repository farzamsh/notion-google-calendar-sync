/**
 * Cloudflare Worker proxy for Notion -> Google Apps Script webhook delivery.
 *
 * Why this exists:
 * Google Apps Script ContentService responses are served through a redirect to
 * script.googleusercontent.com. Notion expects a direct HTTP 200 acknowledgement
 * from the webhook endpoint. The Worker terminates the Notion webhook with 200,
 * validates Notion's HMAC signature, and forwards the raw payload to Apps Script.
 *
 * Configure these Worker secrets:
 *   APPS_SCRIPT_URL              e.g. https://script.google.com/macros/s/.../exec
 *   APPS_SCRIPT_KEY              same value as Apps Script WEBHOOK_SECRET
 *   NOTION_VERIFICATION_TOKEN    add this AFTER receiving the verification token
 *                                and BEFORE clicking Verify in Notion
 */

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Not found', { status: 404 });
    }

    if (!env.APPS_SCRIPT_URL || !env.APPS_SCRIPT_KEY) {
      return new Response('Worker is not configured', { status: 500 });
    }

    const rawBody = await request.text();
    let payload;

    try {
      payload = JSON.parse(rawBody);
    } catch (_) {
      return new Response('Invalid JSON', { status: 400 });
    }

    // Initial Notion subscription verification request.
    // It is intentionally accepted before NOTION_VERIFICATION_TOKEN exists.
    if (payload && payload.verification_token) {
      try {
        await forwardToAppsScript_(rawBody, env);
      } catch (error) {
        console.error('Verification forwarding failed:', error);
        return new Response('Upstream verification failed', { status: 502 });
      }

      return new Response('ok', { status: 200 });
    }

    // Never accept live events until signature validation has been configured.
    if (!env.NOTION_VERIFICATION_TOKEN) {
      return new Response('Signature verification not configured', { status: 503 });
    }

    const signature = request.headers.get('X-Notion-Signature');
    const trusted = await verifyNotionSignature_(
      rawBody,
      signature,
      env.NOTION_VERIFICATION_TOKEN
    );

    if (!trusted) {
      return new Response('Invalid signature', { status: 401 });
    }

    // Acknowledge Notion immediately. Forwarding runs in the background.
    // The Apps Script reconciliation trigger is the repair layer if this
    // downstream delivery ever fails after acknowledgement.
    ctx.waitUntil(
      forwardToAppsScript_(rawBody, env).catch((error) => {
        console.error('Apps Script forwarding failed:', error);
      })
    );

    return new Response('ok', { status: 200 });
  }
};

async function forwardToAppsScript_(rawBody, env) {
  const target = new URL(env.APPS_SCRIPT_URL);
  target.searchParams.set('key', env.APPS_SCRIPT_KEY);

  const response = await fetch(target.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: rawBody,
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error('Apps Script returned HTTP ' + response.status);
  }
}

async function verifyNotionSignature_(rawBody, signatureHeader, verificationToken) {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const hex = signatureHeader.slice('sha256='.length);
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(verificationToken),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  return crypto.subtle.verify(
    'HMAC',
    key,
    hexToBytes_(hex),
    new TextEncoder().encode(rawBody)
  );
}

function hexToBytes_(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
