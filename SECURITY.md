# Security

## Secrets

Never commit any of these:

```text
NOTION_TOKEN
WEBHOOK_SECRET
APPS_SCRIPT_KEY
NOTION_VERIFICATION_TOKEN
private Apps Script /exec URL if you prefer to keep it hidden
```

Store Notion/API configuration in:

**Google Apps Script → Project Settings → Script Properties**

Store Worker-side credentials as encrypted Cloudflare **Secrets**.

The repository contains no real credentials.

## Least privilege

For the Notion connection, grant only:

```text
Read content
Update content
```

Grant content access only to the specific database/data source being synchronized when possible.

The integration does not require comment permissions or user-profile access.

## Apps Script execution identity

The Apps Script Web App executes as the Google account that owns/edits the target Calendar.

The Apps Script endpoint must be publicly reachable because the Cloudflare Worker calls it without interactive Google sign-in. It is protected by `WEBHOOK_SECRET`, which is known to the Worker as `APPS_SCRIPT_KEY`.

Notion does **not** receive the Apps Script key.

## Why Cloudflare sits in front of Apps Script

Google Apps Script `ContentService` serves responses through a redirect to `script.googleusercontent.com`. Notion's webhook contract expects a direct HTTP `200` acknowledgement.

The Worker solves both delivery and authentication:

1. receives the raw Notion webhook request;
2. verifies `X-Notion-Signature` with HMAC-SHA256;
3. returns HTTP `200` directly to Notion;
4. forwards the raw payload to Apps Script using the private `APPS_SCRIPT_KEY`;
5. follows Google's ContentService redirect internally.

## Notion webhook signature validation

Notion signs live webhook events using:

```text
X-Notion-Signature: sha256=<hex digest>
```

The HMAC key is the subscription's one-time `verification_token`.

The Worker stores that value as:

```text
NOTION_VERIFICATION_TOKEN
```

and validates the signature against the **raw request body** before accepting the event.

The initial verification-token request is the only request accepted before HMAC verification is configured. It is forwarded to Apps Script so `showVerificationToken()` can display the token. Add that token to the Worker **before** clicking Verify in Notion.

## Worker → Apps Script authentication

Apps Script requires:

```text
WEBHOOK_SECRET
```

Cloudflare stores the same value as:

```text
APPS_SCRIPT_KEY
```

The Worker adds it to the internal Apps Script request. It is never placed in the public Notion webhook URL.

## Never expose secrets in screenshots/issues/chats

Before posting logs or opening a GitHub issue, redact:

- Notion integration tokens;
- Notion verification tokens;
- Apps Script `WEBHOOK_SECRET`;
- Cloudflare `APPS_SCRIPT_KEY`;
- full private URLs containing credentials;
- private Notion page URLs if sensitive;
- private Google Calendar IDs if sensitive.

## Token rotation

### If the Notion integration token is exposed

1. rotate/revoke it in Notion;
2. update `NOTION_TOKEN` in Apps Script Script Properties;
3. run `validateSetup()`;
4. inspect recent Apps Script executions.

### If `WEBHOOK_SECRET` / `APPS_SCRIPT_KEY` is exposed

1. run `createWebhookSecret()` again in Apps Script;
2. copy the new `WEBHOOK_SECRET`;
3. replace the Cloudflare Worker `APPS_SCRIPT_KEY` secret;
4. deploy the Worker settings;
5. the Notion webhook URL does **not** need to change.

### If `NOTION_VERIFICATION_TOKEN` is exposed

1. delete/recreate the Notion webhook subscription;
2. retrieve the new verification token;
3. update Cloudflare `NOTION_VERIFICATION_TOKEN`;
4. verify the new Notion subscription.

## Acknowledgement vs downstream processing

After validating a live Notion signature, the Worker acknowledges Notion immediately and forwards to Apps Script in the background. This avoids webhook pauses caused by downstream response behavior or latency.

The 15-minute Apps Script reconciliation trigger is the repair layer if a downstream forward fails after Notion has already received `200 OK`.

This means reconciliation is part of the reliability model, not merely an optional convenience.

## Destructive actions

The Apps Script code only deletes a Calendar event when it can establish ownership through its private Notion page tag and/or agreeing stored event IDs.

Do not weaken these ownership checks to "delete an event with the same title." Titles are not identities.
