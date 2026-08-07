# Security

## Secrets

Never commit any of these:

```text
NOTION_TOKEN
WEBHOOK_SECRET
NOTION_VERIFICATION_TOKEN
full /exec webhook URL containing ?key=...
```

Store them in:

**Google Apps Script → Project Settings → Script Properties**

The repository's source code contains no real credentials.

## Least privilege

For the Notion connection, grant only:

```text
Read content
Update content
```

Grant content access only to the specific database/data source being synchronized when possible.

The integration does not require comment permissions or user-profile access.

## Apps Script execution identity

The Web App must execute as the account that owns/edits the target Google Calendar.

Because Notion must call the endpoint without interactive Google sign-in, the web app must be externally reachable. Treat the URL as a sensitive endpoint.

## Webhook authentication limitation

Notion recommends validating each event's `X-Notion-Signature` using HMAC-SHA256 and the subscription verification token.

Google Apps Script's documented `doPost(e)` web-app event exposes:

- query parameters;
- path info;
- POST body/content metadata;

but does not document access to arbitrary incoming HTTP headers. Therefore this Apps Script-only implementation cannot directly read `X-Notion-Signature`.

### Compensating control

The endpoint requires a long, random query-string secret:

```text
...?key=<WEBHOOK_SECRET>
```

Requests without the exact secret are rejected before synchronization logic runs.

Generate it with:

```text
createWebhookSecret()
```

### Consequences

This is reasonable for a personal/task automation where the webhook URL is kept private, but it is weaker than cryptographic payload authentication.

For regulated, high-value, hostile, or multi-user production systems, put a small proxy in front of Apps Script (Cloudflare Worker, Cloud Run, serverless function, etc.) that can validate `X-Notion-Signature`, then forward only verified events.

## Never expose the secret in screenshots/issues

Before opening a GitHub issue, redact:

- Notion integration tokens;
- Script Properties values;
- webhook verification tokens;
- full webhook URLs;
- private Notion page URLs if sensitive;
- private Google Calendar IDs if sensitive.

## Token rotation

If a Notion token is exposed:

1. revoke/rotate the connection token in Notion;
2. update `NOTION_TOKEN` in Script Properties;
3. run `validateSetup()`;
4. inspect recent Apps Script executions.

If `WEBHOOK_SECRET` is exposed:

1. generate a new secret;
2. the webhook URL changes;
3. delete/recreate the Notion webhook subscription using the new URL;
4. verify the new subscription.

## Destructive actions

The code only deletes a Calendar event when it can establish ownership through its private Notion page tag and/or agreeing stored event IDs.

Do not weaken these ownership checks to "if an event with the same title exists, delete it." Titles are not identities.
