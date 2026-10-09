# Connect GitHub and Connect LinkedIn

lee can connect each user's own GitHub and LinkedIn accounts (Settings › Integrations), import a LinkedIn data export, and draft LinkedIn posts (Settings › LinkedIn).

The ground rules:

- **Per user.** A connection belongs to one lee user. Nothing ever falls back to the owner's connection. A missing app credential shows "not configured" instead.
- **Encrypted.** Access and refresh tokens are stored encrypted with `lib/crypto/token-vault.ts` (AES-256-GCM, the same scheme as the service-key store). They are never logged; `tests/unit/integrations.test.ts` covers the redaction.
- **The user clicks.** lee never posts, publishes or changes anything on GitHub or LinkedIn without an explicit click. It never schedules posts, and never likes, comments or sends connection requests.
- **App credentials live in env.** These are deployment-level credentials, so they are environment variables (validated as optional in `lib/env/schema.ts`). Per-user connections are made in the UI.

## 1. Owner setup: the GitHub App

Docs: [Registering a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app).

1. Go to GitHub › Settings › Developer settings › GitHub Apps › **New GitHub App**.
   - **GitHub App name:** for example `lee-<you>`. The URL name ("slug") becomes `GITHUB_APP_SLUG`.
   - **Homepage URL:** `https://getlee.vercel.app`
   - **Callback URL:** `https://getlee.vercel.app/api/integrations/github/callback`. Add `http://localhost:3000/api/integrations/github/callback` too if you develop locally (up to 10 callback URLs are allowed).
   - **Expire user authorization tokens:** keep it ticked (the default). User tokens then last 8 hours and refresh tokens 6 months, and lee refreshes them itself.
   - **Request user authorization (OAuth) during installation:** leave it off. lee starts the authorization itself, with PKCE.
   - **Webhook:** untick **Active**. lee needs no events.
2. Set the **permissions**. Ask for the minimum:
   - Repository › **Metadata: Read-only**. GitHub makes this mandatory once you pick any repository permission.
   - Repository › **Contents: Read and write**. This is used to commit `profile.json` and to read `package.json` / `composer.json`.
   - Account › **Starring: Read-only**. This one is optional; it is only for "Suggest my starred repos for Radar".
   - Nothing else.
3. **Where can this GitHub App be installed?** Choose "Only on this account" for a personal deployment, or "Any account" for the invite beta.
4. Create the app. On its page:
   - note the **App ID** and the **Client ID**;
   - click **Generate a new client secret**;
   - click **Generate a private key**, which downloads a `.pem` file.
5. Add these in Vercel › Project › Settings › Environment Variables (Production, and Preview if you use it), then redeploy:

   | Variable | Value |
   |---|---|
   | `GITHUB_APP_ID` | the numeric App ID |
   | `GITHUB_APP_CLIENT_ID` | the Client ID (`Iv1.…` / `Iv23…`) |
   | `GITHUB_APP_CLIENT_SECRET` | the client secret (mark it **Sensitive**) |
   | `GITHUB_APP_PRIVATE_KEY` | the whole PEM file contents. Literal `\n` escapes are accepted. Mark it **Sensitive**. |
   | `GITHUB_APP_SLUG` | the app's URL name |

6. In lee, go to Settings › Integrations › GitHub › **Connect GitHub** and authorize.
7. Then **Install on a repository** (or `https://github.com/apps/<slug>/installations/new`). Choose **Only select repositories** and pick your **portfolio** repo. Add private repos only if you want them shown as evidence. You can change the selection later with **Manage repositories** (GitHub › Settings › Applications › Installed GitHub Apps › Configure).

### What lee does with it

- **Connect** uses the [user access token web flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app):
  - `state`, plus PKCE `code_challenge` with S256 (GitHub supports only S256);
  - the code is exchanged with the client secret and the `code_verifier`.
  - The state is single use, valid for 10 minutes, and bound to the signed-in user and to an httpOnly cookie on the callback path (`lib/integrations/oauth-state.ts`).
- **Refresh** follows [Refreshing user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens). A refresh invalidates the old pair, so lee stores the new pair right away.
- **Disconnect** calls `DELETE /applications/{client_id}/grant` ([OAuth applications API](https://docs.github.com/en/rest/apps/oauth-applications)), which revokes every token. It also deletes the stored tokens and the cached repo stats. The app stays installed until the user uninstalls it.
- **Publish to portfolio** prefers an [installation token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation):
  - It is signed with the app JWT (RS256, `exp` at most 10 minutes; see [the JWT docs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app)).
  - It is valid for 1 hour, narrowed to the one configured repository and to `contents: write` + `metadata: read`.
  - The installation id comes from the user's own token (`GET /user/installations`), so it is always that user's installation.
  - If GitHub refuses (the repo is not in the installation), Publish falls back to the fine-grained token saved in Settings › Publish.
  - The sha/conflict flow is unchanged.
- **Résumé › From GitHub** lists:
  - the user's public repos and the repos granted to the app;
  - for each: languages, stars, the user's commit count (`/commits?author=`, counted from the `Link` header), the last commit, and the PR count (`/search/issues?q=repo:… is:pr author:…`; search allows 30 requests a minute, see [the search docs](https://docs.github.com/en/rest/search/search)).
  - At most 15 repos are listed, refreshed at most every 12 hours, and cached compactly in `github_repo_stats`. Unlinked rows are pruned after 30 days by the nightly retention.
  - Linking a repo to a project is evidence only. It never changes `interviewReady`; it can only suggest a review. The repo's description and topics can be applied to the project after the user ticks them.
- **Radar** turns the user's starred repos (opt-in) and the `package.json` / `composer.json` dependencies of repos they tick into release-project *suggestions*. They are added to the release list only on confirm.
  - A starred repo outside the catalog is followed as `gh:owner/repo`, using its GitHub releases.

### What GitHub allows and what it does not

- A user access token "only has permissions that both the user and the app have", and only on accounts where the app is installed ([docs](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user)). So private repos are visible only if the user installed the app on them.
- An installation token "cannot be granted access to repositories that the installation was not granted access to".
- There is no Setup URL while "Request user authorization during installation" is on. lee does not need one.

## 2. Owner setup: the LinkedIn developer app

Docs:
- [Sign In with LinkedIn using OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)
- [Authorization code flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)
- [Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin)
- [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api)

Steps:

1. Go to [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps) › **Create app**.
   - **LinkedIn Page:** an app must be associated with a LinkedIn Page. Create a simple Page for lee if you have none. A Page super admin verifies the association through the generated verification URL (valid for 30 days).
   - Add the privacy policy URL `https://getlee.vercel.app/privacy` and a logo.
2. **Products** tab: request **Sign In with LinkedIn using OpenID Connect**. Add **Share on LinkedIn** too if users should be able to post. Both are self-serve.
3. **Auth** tab › **Authorized redirect URLs for your app**: add `https://getlee.vercel.app/api/integrations/linkedin/callback`, plus `http://localhost:3000/api/integrations/linkedin/callback` for local development. The redirect must match exactly.
4. Copy the **Client ID** and **Primary Client Secret** into Vercel, then redeploy:

   | Variable | Value |
   |---|---|
   | `LINKEDIN_CLIENT_ID` | the Client ID |
   | `LINKEDIN_CLIENT_SECRET` | the client secret (mark it **Sensitive**) |

5. In lee, go to Settings › Integrations › LinkedIn. Tick **Allow posting** if wanted, then **Connect LinkedIn**.

### What lee does with it

- **Connect** requests `openid profile email`, plus `w_member_social` only when "Allow posting" is ticked.
  - It sends `state` and an OIDC `nonce`.
  - The `id_token` is verified (RS256 against `https://www.linkedin.com/oauth/openid/jwks`; issuer, audience = client id, expiry, nonce).
  - Then `GET /v2/userinfo` gives the name, picture and email (email is optional in LinkedIn's answer).
- **Expiry.** LinkedIn access tokens last 60 days. Programmatic refresh tokens are only for approved partners, so the card shows the expiry date and the user reconnects. If they are still signed in to LinkedIn, there is no consent screen.
- **Disconnect** deletes the token. LinkedIn documents no member token-revocation endpoint, so the card also links to LinkedIn › Settings › Data privacy › **Permitted services**, where the user can remove lee.
- **Post** sends `POST https://api.linkedin.com/rest/posts` with `Linkedin-Version: 202609` and `X-Restli-Protocol-Version: 2.0.0`.
  - The body is `author = urn:li:person:{sub}`, `visibility PUBLIC`, `distribution.feedDistribution MAIN_FEED` and `lifecycleState PUBLISHED`, with the text escaped for LinkedIn's "little" text format.
  - The post URN comes back in `x-restli-id`, and lee keeps the post URL in the history.
  - It runs only from the composer's **Post** button, after a preview, and the server re-checks the fact lock.
  - Versions are supported for about a year (202510 sunsets on Oct 15, 2026). Bump `LINKEDIN_API_VERSION` in `lib/integrations/linkedin/share.ts` yearly.

### What LinkedIn allows and what it does not

- **Allowed:**
  - sign-in basics (name, photo, email) through OIDC;
  - posting on the member's behalf with `w_member_social` (the legacy UGC Posts API is limited to 150 requests a day per member).
- **Not available without partner approval:**
  - reading or editing the profile, connections, messages or jobs;
  - reading posts (`r_member_social` is restricted).
  - So profile edits stay manual: the optimizer gives copy buttons.
- **[API Terms of Use](https://www.linkedin.com/legal/l/api-terms-of-use):**
  - no scraping or access outside the APIs (§3.1.24);
  - no automated posting (§3.1.26), so each post is a user click;
  - refresh profile data only while the member is using the app (§4.3);
  - delete data on request (§4.4).
- **PKCE** is offered only for native clients ([native PKCE](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow-native)). The web flow relies on `state` plus the client secret.

## 3. LinkedIn data export (no API)

How the user gets the export ([LinkedIn help](https://www.linkedin.com/help/linkedin/answer/a1339364)):

- On LinkedIn: Me › Settings & Privacy › Data privacy › **Get a copy of your data**.
- The smaller files (Profile, Positions, Education, Skills, Certifications, Languages) arrive within minutes. Connections can take up to about 48 hours.
- The download stays available for 72 hours.

How lee reads it:

- The ZIP is read **in the browser** (fflate, loaded on demand). Only these CSVs are decompressed: `Profile`, `Positions`, `Education`, `Skills`, `Certifications`, `Projects`, `Languages` and `Connections`. Messages and other files are never read.
- Headers are matched case-insensitively, and the header row is searched for, because `Connections.csv` starts with "Notes:" lines.
- Dates like `Jan 2020`, `2020`, `15 Mar 2023` and `1/5/24` are accepted. Every file is optional.
- **Review:** every position, school, skill, certification, project and language is a suggestion, marked new or "already in your profile". Duplicates are never added.
  - New skills, projects and bullet highlights are **not interview-ready** unless the user ticks "Mine".
  - The LinkedIn headline, About and positions are kept for the optimizer.
- **Connections:**
  - stored as name, company, position and connected-on (`linkedin_connections`);
  - emails only if the export has them **and** the user opts in;
  - private to the user, searchable, with **Delete all**.
  - They power the "You know N people at X" hint on discoveries and applications, with an editable referral-ask draft the user sends themselves.
  - Company names are matched after dropping legal suffixes and punctuation (`lib/integrations/linkedin/company-key.ts`), as whole-word prefixes ("Careem" matches "Careem Networks FZ-LLC").

## 4. Testing offline

Unit and integration tests use in-memory fakes:

- `tests/fixtures/fake-github-app.ts`: OAuth with PKCE, refresh rotation, the installation-token JWT check, repos, commits, search and revoke.
- `tests/fixtures/fake-linkedin.ts`: OIDC with a signed `id_token`, JWKS, userinfo and Posts.
- `tests/fixtures/linkedin-export.ts`: a synthetic export ZIP with the real headers.

The e2e run points lee at local stubs, `tests/e2e/github-stub.mjs` and `tests/e2e/linkedin-stub.mjs`, through:

- `GITHUB_WEB_URL` and `GITHUB_API_URL`;
- `LINKEDIN_WEB_URL` and `LINKEDIN_API_URL`.

These overrides are honored only for `https` URLs, or for `http://localhost` outside production (`lib/integrations/config.ts`).
