# Smart Direct — Instagram connection

ELINOR IQ uses the **Instagram API with Instagram Login** (`graph.instagram.com`).
It does not archive Instagram inboxes and does not import historical conversations.

Required scopes:

- `instagram_business_manage_messages`
- `instagram_business_basic` (account identity)

Do **not** use the deprecated `business_manage_messages` scope.

This is not Meta App Review / Advanced Access approval. Testing is limited to app roles until Meta grants production access.

## Public HTTPS callback

Meta only verifies and delivers webhooks over **public HTTPS**. `http://localhost:8080` cannot be used as the callback.

For local development, put a tunnel in front of the running stack and point Meta at:

```text
https://<your-public-host>/api/smart-direct/instagram/webhook/
```

Use any HTTPS tunnel you already trust (examples: Cloudflare Tunnel, ngrok). The app does not embed a tunnel provider.

Also add the tunnel hostname to `DJANGO_ALLOWED_HOSTS` in `.env`.

Include the trailing slash. Meta POST bodies are lost if the URL is redirected.

## Environment

Set these in `.env` (never commit real values):

```text
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_ACCOUNT_ID=
INSTAGRAM_VERIFY_TOKEN=
INSTAGRAM_API_VERSION=v25.0
```

Tokens stay in environment variables. They are not stored in the database and are not shown in the UI.

## Meta Developer Dashboard

1. Convert the Elinor Instagram account to a **Professional** account (Business or Creator).
2. Create or open a Meta app and add **Instagram** with **Instagram API with Instagram Login**.
3. Add a test Instagram professional account and tester users under App Roles. Only those accounts can message the app until Advanced Access is granted.
4. Request scopes `instagram_business_basic` and `instagram_business_manage_messages`. Complete Business Login / token exchange for the professional account. Put the Instagram user access token in `INSTAGRAM_ACCESS_TOKEN` and the professional account ID in `INSTAGRAM_ACCOUNT_ID`.
5. In Webhooks, create a subscription for the Instagram object:
   - Callback URL: `https://<your-public-host>/api/smart-direct/instagram/webhook/`
   - Verify token: the same string as `INSTAGRAM_VERIFY_TOKEN`
   - Subscribe to the `messages` field
6. After dashboard subscription, enable account-level delivery:

```bash
curl -X POST "https://graph.instagram.com/v25.0/${INSTAGRAM_ACCOUNT_ID}/subscribed_apps?subscribed_fields=messages" \
  -H "Authorization: Bearer ${INSTAGRAM_ACCESS_TOKEN}"
```

7. Keep the Meta app **Live** if you need Meta to deliver real webhook notifications. Live mode is not the same as App Review approval.
8. From a tester Instagram account, send a DM to the professional account. Then use **دایرکت هوشمند** → temporary debug reply box to send a manual text reply.

## Production limits

- A customer must message the professional account first. Replies are limited to Meta’s 24-hour messaging window.
- Standard access is restricted to app/tester/admin roles. Serving normal Instagram customers requires **App Review** and **Advanced Access** for `instagram_business_manage_messages`.
- Do not treat this section as production-approved until Meta actually grants that access.
- ELINOR IQ stores only a short-lived recent context (72 hours) plus session/event outcomes. Instagram remains the conversation store.
