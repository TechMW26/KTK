# Kill the King — User Accounts: Design

**Status: PROPOSAL — nothing in this document is implemented.**
This is a design for review. No code, rules, or config changes have been made.

It is the prerequisite work for the MOM items that need a durable identity:
item 4 (betting/currency), item 5 (time bonus), item 7 (user profile) and
item 9 (Facebook login). Those items remain **unspecified and unapproved**; this
document only builds the foundation they would sit on.

---

## 1. Why this is needed

Today the game has **no accounts**. `lib/firebase/auth.ts` only does
`signInAnonymously()`, so every player is a throwaway `uid`.

Every RTDB rule is built on that assumption — the room's hidden King lives at
`rooms/{code}/secrets/{uid}` and is readable *only* by `auth.uid === $uid`
(`firebase/database.rules.json`), and the game node is scoped to a room's
`players` node.

An anonymous `uid` is **ephemeral**:

| Event | Result today |
| --- | --- |
| Clear site data / reinstall the APK | New `uid`, old identity gone |
| Switch device | New `uid`, no continuity |
| Anything attached to that `uid` (currency, profile, progression) | **Unrecoverable** |

That is the blocker. Currency and profile cannot be built on an identity that
can evaporate.

### Decisions taken (confirmed with the product owner)

| Question | Decision |
| --- | --- |
| Providers | **Email/password + Google + Apple**, anonymous guest kept as the entry |
| Provider platforms | **All platforms** — Google and Apple offered on web, Android *and* iOS (see §3.5 for cost) |
| Entry flow | **Guest-first** — anonymous play stays the default; an account is opt-in and only required for currency/profile |
| Currency scope | Profile/currency may live under `users/{uid}`, but **currency rules are NOT designed here** — they wait for item 4 |
| Dev/staging project | **Does not exist yet — must be set up** (Firebase project + providers). Blocking prerequisite for S1 |
| Email verification | **Required** — an email account is not "real" until the address is verified (see §3.6) |
| Deliverable | Design doc first, then implementation in approved slices |

---

## 2. The one technical rule that must not be broken

**Upgrading a guest to a real account must preserve `auth.uid`.**

Firebase's `linkWithCredential()` keeps the existing anonymous `uid` and attaches
a real credential to it. Calling `signInWithCredential()` instead **produces a
new `uid`**, which would orphan:

- every `rooms/{code}/secrets/{uid}` node the player ever wrote,
- their `players/{uid}` room entries,
- and any future `users/{uid}` profile.

So the design is: **link, never replace.** This is the single most important
constraint in the whole system, and it is the reason the login flow is written as
an upgrade path rather than a fresh sign-in.

---

## 3. Authentication model

### 3.1 Providers

| Provider | Platform notes |
| --- | --- |
| **Anonymous** | Unchanged. The default entry. Never shown as "an account". |
| **Email/password** | Needs verification + reset flows. Works everywhere. |
| **Google** | Web: popup/redirect. Capacitor Android: needs the native Google sign-in path, not a web popup. |
| **Apple** | **Required by App Store review** if Google is offered on iOS. Needs a Service ID + key. |

### 3.2 Upgrade paths (guest → account)

| From | Method | `uid` preserved |
| --- | --- | --- |
| Guest → email/password | `linkWithCredential(EmailAuthProvider.credential(...))` | ✅ yes |
| Guest → Google | `linkWithPopup` / native equivalent | ✅ yes |
| Guest → Apple | `linkWithCredential(OAuthProvider(...))` | ✅ yes |

**Collision case (implemented):** if the chosen credential already belongs to
another account, linking fails with `auth/credential-already-in-use` (or
`auth/email-already-in-use` for the password path). The dialog then switches to a
dedicated **collision** view offering to sign in to the existing account.
**We must not silently merge two accounts**; a merge is destructive and ambiguous
and is explicitly out of scope.

> **Corrected copy.** An earlier draft told the player *"your guest progress
> stays on this device"*, which is wrong and was misleading. Signing in to the
> existing account moves the player to a **different uid**, so the guest identity
> and anything stored against it are abandoned. The view now says so plainly:
> *"Signing in will switch you to that account. Your guest progress on this
> device won't carry over."* The two paths are deliberately distinct —
> `startGoogleSignIn` links and preserves the uid, `signInToExisting` replaces it.

The email collision has no shortcut: only the player knows the existing password,
so the collision view routes them to the normal email form to sign in with it.

### 3.3 Session persistence

- **Web:** `browserLocalPersistence` (survives reload).
- **Capacitor Android:** Firebase Auth persists to IndexedDB/localStorage inside
  the WebView, but Android can evict WebView storage. The design assumes a
  **re-link on cold start** safety net rather than trusting persistence blindly.

### 3.4 Provider configuration required (not yet done)

**No dev/staging Firebase project exists yet — setting one up is a blocking
prerequisite for slice S1.** Required work:

- Create the Firebase project(s) for dev/staging (and confirm which project
  local dev and production each point at).
- Firebase console: enable Email/Password, Google, Apple, Facebook.
- Google OAuth client IDs for **web + Android (SHA-1 keystore fingerprint) + iOS**.
- Apple Service ID, Team ID, Key ID, private key.
- Facebook App ID + App Secret, entered **in the Firebase console only**
  (Authentication → Sign-in method → Facebook). Neither value belongs in the
  client bundle or in a `NEXT_PUBLIC_*` variable; the client only ever names the
  provider (`facebook.com`) and Firebase performs the token exchange.
- Authorised domains for the deployed origin.

### 3.4b Redirect sign-in requires a same-origin auth helper

**This is a hard requirement, not a nicety, and it silently broke Google
sign-in once already.**

Firebase's redirect and popup flows run through a hidden iframe served from
`authDomain`. When that domain differs from the page's own origin — the default
case for any app not hosted on Firebase Hosting — browsers apply third-party
storage partitioning, the iframe request is **aborted**, and **no session is
ever written**. The sign-in then returns nothing and produces no error.

Firebase documents this: the flow needs same-origin storage unless the app is
hosted on Firebase Hosting itself.

The app is hosted on Vercel, so `/__/auth/*` and `/__/firebase/*` are proxied
back to the Firebase project and `authDomain` is set to the app's **own origin**,
keeping the iframe same-origin:

| Where | Mechanism |
| --- | --- |
| Production | `rewrites` in `vercel.json` (a transparent proxy, **not** a redirect) |
| Local dev | `server.proxy` in `vite.config.ts`; `changeOrigin` must be `true` or Firebase's certificate fails altname validation |
| Config | `resolveAuthDomain()` in `lib/firebase/config.ts` uses `window.location.host`, so localhost, previews and production each resolve to themselves |

The proxy target must stay in step with `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`. If
the Firebase project changes, update `vercel.json` and `vite.config.ts` together.

If sign-in ever regresses to "completes but lands signed out with no error",
check this first: look for an aborted `/__/auth/iframe` request and an empty
`firebaseLocalStorage` in the browser.

### 3.4c The scheme of the auth helper must match the scheme of the page

**This is the second failure mode of the same class, and it fails loudly with
`ERR_SSL_PROTOCOL_ERROR`.** The proxy in §3.4b makes `/__/auth/*` *reachable* on
our own origin, but it does not make that origin reachable over the right
scheme.

The helper script the SDK loads from `authDomain` — `/__/auth/handler` — picks
its page transport from **its own** `window.location.protocol`. When the page is
served over plain `http` (the development server), the helper runs over `http`
and therefore redirects the browser back down the `http` path. It writes
`postBody` plus `redirectUrl` into that URL and posts the response to
`this.parent`, which for a top-level redirect is `window` itself.

The problem is the *response* URL: it is `http://<authDomain>:<port>/__/auth/handler?...`.
In development `authDomain` is `localhost` and the port is added, so the browser
is sent to `http://localhost:3000/__/auth/handler?…` and then, on some
navigations, to `https://localhost:3000/…`. The dev server only speaks HTTP, so
the TLS handshake receives a plaintext `HTTP/1.1 200` response:

```
* Host localhost:3000 was resolved.
*   Trying [::1]:3000...
* schannel: next InitializeSecurityContext failed: SEC_E_INVALID_TOKEN
curl: (35) ...
```

That is exactly what Chromium reports as `ERR_SSL_PROTOCOL_ERROR (-107)`. Both
`localhost:3000` and `127.0.0.1:3000` behave identically: the HTTP listener
answers a TLS `ClientHello`, so the connection dies before any request is routed.
The `/__/auth/handler` proxy itself is healthy — over `http` it returns the
helper page with a `200` (`x-served-by: cache-bom-…`, i.e. proxied through to
Firebase). It is the **scheme**, not the path or the proxy, that is wrong.

Consequences and rules:

- **`vinext dev` must be served over TLS.** It has no TLS listener of its own, so
  any flow that ends up at `https://localhost:3000` can never succeed. Provider
  redirect sign-in (`linkWithRedirect` / `signInWithRedirect`) is therefore
  broken against a plain-HTTP dev server. `vite.config.ts` adds
  `@vitejs/plugin-basic-ssl` under `command === "serve"` only, so dev runs on
  `https://localhost:3000` while the Nitro/Vercel build is untouched.
- **The certificate is self-signed, and that is not a blocker — just a caveat.**
  Because Chromium never consults the OS trust store for `https://localhost`,
  there is no way to make it "trusted" here (so `mkcert` would not have helped
  either). The first visit shows a certificate warning that must be accepted for
  the browser to treat `https://localhost:3000` as a secure context. If that
  interstitial is itself the problem, the alternative is a TLS reverse proxy in
  front of the dev server with a certificate you control.
- The page that starts the flow decides the scheme, so **do not try to rewrite
  the redirect** — fix the scheme the page is served from.
- The URL currently observed also shows the helper still on its
  `firebaseapp.com` target (`appName=%5BDEFAULT%5D`, `v=9.23.0`). `authDomain`
  may be left at the default `killtheking-94396.firebaseapp.com` while this is
  diagnosed: returning to `/__/auth/handler` on firebaseapp.com is a *valid*
  `https` origin and does not itself produce `ERR_SSL_PROTOCOL_ERROR`. It only
  costs same-origin storage (§3.4b), so the flow must additionally work in a
  first-party context — `http://localhost` does not qualify as a secure context
  for some of these APIs, so an `https://localhost` origin is preferable.
- Check `localhost` being present under Firebase console → Authentication →
  Settings → **Authorized domains** — `http://localhost` is authorised by
  default, **`http://localhost:3000` may not be**, which shows up as
  `auth/unauthorized-domain`. This repo's default port is `3000`
  (`vinext dev`, `-p/--port`, default `3000`).

To confirm the diagnosis rather than guess it, compare the two spellings of
`localhost` — this is the single most useful test because it separates "the
proxy is broken" from "the scheme is unreachable":

```powershell
curl.exe -i  --max-time 15 "http://localhost:3000/__/auth/handler"   # 200, helper page
curl.exe -i  --max-time 8  "https://localhost:3000/"                 # (35) TLS handshake fails
```

### 3.5 All-platform sign-in: scope and cost

Confirmed decision: Google and Apple are offered on **every** platform. This is
supported but is the most configuration-heavy option, and the costs should be
explicit:

| Provider | Web | Android | iOS |
| --- | --- | --- | --- |
| Google | popup / redirect + OAuth client | native Google Sign-In + SHA-1 | needs Google config in the iOS project |
| Apple | OAuth redirect (Service ID) | OAuth redirect (browser, not a native sheet) | native sheet |
| Email/password | universal | universal | universal |

Implications:

- **Apple Developer account required** (paid, annual) purely to obtain the
  Service ID + key — even though the app is primarily Android/web today.
- Apple on Android/web degrades to a **browser redirect**, a noticeably weaker
  experience than the native sheet on Apple hardware. Acceptable, but it should
  be a conscious choice.
- Provider credential setup spans **3 consoles** (Firebase, Google Cloud, Apple
  Developer) and is the main source of schedule risk in slices S2–S3.

### 3.6 Email verification (confirmed required)

An email/password account is **not considered "real" until the address is
verified**. Consequences:

- After sign-up the flow lands on the `verify-sent` state (§4.2), and the account
  is marked unverified.
- `emailVerified` is read from the Firebase user record; verification itself is
  handled by Firebase's verification email.
- **Confirmed gating rule:** unverified email accounts **may play and may set a
  display name**, but **may not receive or hold currency**. Currency is
  transferable value, which is the reason verification is required at all; play
  is not gated, so verification never becomes a barrier to enjoying the game.
- Google and Apple sign-ins arrive already-verified by the provider, so the gate
  only applies to the email/password path.

---

## 4. Login page & flow

### 4.1 Where it appears

Guest-first means the login screen is **never a hard gate at launch**. It is
reached from two places:

1. **Home screen** — a small, persistent "Sign in" affordance (§4.4).
2. **Just-in-time prompts** — the first time a player reaches something that
   needs a durable identity (claiming currency, opening the account page). These
   remain stub-free until items 4/5/7 are specified.

### 4.2 Screen states

| State | Content |
| --- | --- |
| `idle` | Provider buttons (Google, Apple), email/password form, and a "Continue as guest" affordance |
| `signup` | Email + password + confirm, password-strength hint, ToS/privacy consent |
| `verify-sent` | "Check your email" — resend, and a "change address" escape |
| `reset` | Request reset link; then "link sent" confirmation |
| `linking` | Transient: "Saving your progress…" (this is the `linkWithCredential` call) |
| `collision` | Credential already in use → offer sign-in instead (§3.2) |
| `error` | Mapped, human-readable message (see §4.3) |

### 4.3 Error mapping (never surface raw Firebase codes)

| Firebase code | Player-facing message |
| --- | --- |
| `auth/invalid-email` | "That email doesn't look right." |
| `auth/wrong-password` / `invalid-credential` | "Email or password is incorrect." |
| `auth/email-already-in-use` | "That email already has a profile — sign in instead?" |
| `auth/weak-password` | "Use at least 8 characters." |
| `auth/too-many-requests` | "Too many attempts. Try again in a few minutes." |
| `auth/popup-closed-by-user` | *(silent no-op)* |
| `auth/network-request-failed` | "No connection — check your network." |
| `auth/credential-already-in-use` | → the `collision` state |

### 4.4 Flow diagram

```
Launch
  └─ ensureSignedIn()            ← unchanged, still used by multiplayer
       └─ anonymous uid
            ├─ Play (vs bot / local / online)  ── unchanged, works forever
            └─ "Sign in" (home, or a JIT prompt)
                 ├─ Google ──┐
                 ├─ Apple  ──┼─→ linkWithCredential / linkWithPopup
                 └─ Email  ──┘        │
                                      ├─ success  → uid PRESERVED → account page
                                      └─ collision → offer sign-in to existing
                                                     account (no auto-merge)
```

---

## 5. Account page & flow

### 5.1 Sections

| Section | Contents |
| --- | --- |
| **Identity** | Editable display name (sourced from the account — see B4), avatar (later), member-since |
| **Profile** | Editable name, country, date of birth; read-only email taken from Firebase Auth |
| **Statistics** | Matches played / won, derived winning ratio. Written only by the game loop |
| **Sign-in methods** | Which providers are linked; link an additional one; unlink (blocked if it is the last one) |
| **Wallet** | **Placeholder only.** Rendered as "coming soon" until item 4 defines currency |
| **Danger zone** | Sign out; delete account (soft delete + typed confirmation, see §5.4) |

### 5.2 Data model

A single `users/{uid}` node. **Profile only** — no currency fields are designed
here, because item 4 is unspecified:

```jsonc
users/{uid}: {
  displayName: string,          // mirrors into room player entries (see B4)
  createdAt:   number,          // ms epoch
  updatedAt:   number,
  providers:   ["password", "google.com", "apple.com"],
  emailVerified: boolean,       // mirrors the Firebase user record (§3.6)
  // --- soft delete (§5.4) ---
  deletedAt:   number | null,   // null while active
  // --- profile (§5.5) ---
  name:        string,          // <= 32 chars; kept in step with displayName
  country:     string,          // ISO 3166-1 alpha-2, "" when unset
  dateOfBirth: string,          // "YYYY-MM-DD", "" when unset
  // --- statistics (§5.6) ---
  matchesPlayed: number,        // non-decreasing, integer
  matchesWon:    number,        // non-decreasing, integer
  // currency intentionally NOT modelled yet — see MOM item 4
}
```

There is deliberately **no `email` field**. Identity is the Firebase Auth
record; a stored copy would be a second source of truth that could drift from
it, and an editable one would be a spoofing vector.

### 5.2.1 Why Realtime Database and not Firestore

The account data lives in RTDB because the whole app already does: rooms,
matchmaking, secrets and the profile node are all RTDB behind
`firebase/database.rules.json`. Introducing Firestore for one collection would
mean a second database, a second rules file, and two places to look for a user.
The requested `users/{uid}` document maps exactly onto the existing node.

### 5.5 Editable profile fields

Written by `saveProfileDetails()` in `lib/firebase/profile.ts`, reached from the
Account screen's **Save Changes**. Validation lives in that function, not the
component, so the rules and the UI cannot drift apart.

| Field | Stored as | Rules |
| --- | --- | --- |
| `name` | string | non-empty after trim, ≤ 32 chars |
| `country` | ISO alpha-2 | must be a code from `lib/profile/countries.ts`, ≤ 2 chars |
| `dateOfBirth` | `YYYY-MM-DD` | real calendar date, not future, not > 120 years ago |

`name` also updates `displayName` (truncated to 24 chars) in the same write:
the home screen and room entries still read `displayName`, and letting the two
diverge would show the player a different name on each screen.

### 5.6 Statistics integrity

`matchesPlayed`/`matchesWon` have exactly one writer: `recordMatchResult()`.

- **No UI accepts a number.** The statistics section is read-only and the fields
  are absent from the `ProfilePatch` allow-list, so the Account screen has no
  code path that can set them.
- **The rules enforce monotonicity.** Both fields validate as non-negative
  integers that are `>= data.val()`, so even a hand-crafted client cannot lower
  a total or set a fractional value.
- **Recorded once per match.** `app/page.tsx` watches `phase === "match-end"`
  and guards with a ref, so re-renders, StrictMode double-invokes and "PLAY
  AGAIN" cannot inflate the counts.
- **The winner matches the screen.** The same score/lives comparison the
  match-end screen renders decides win vs loss, so the statistic can never
  contradict the result the player just saw.
- **Best-effort.** A failed stats write is logged and never breaks the
  match-end screen.

Winning ratio is derived at render time and never stored:

```
matchesPlayed === 0 ? "0%" : (matchesWon / matchesPlayed * 100).toFixed(1) + "%"
```

Zero matches renders **0%**, not `NaN%` — the state every new player starts in.

### 5.7 Anonymous guests are never persisted

`ensureProfile()` returns `null` without writing when `user.isAnonymous`, and
`useAccount` does not call it for a guest at all. Guests are throwaway
identities the player never chose to keep, so persisting one would only litter
the database with rows that can never be reclaimed. A profile appears when the
guest links a provider — `linkWithCredential` preserves `auth.uid`, so the
account inherits the identity it already had.

The rules cannot enforce this (an anonymous token still carries a `uid`), so the
guard is client-side, in the one function that creates profiles.


### 5.3 Account flow

```
Account page
  ├─ Edit display name ──→ users/{uid}.displayName
  ├─ Save profile (name/country/DOB) ──→ users/{uid} (+ displayName in step)
  ├─ Match ends ──→ users/{uid}.matchesPlayed++ / matchesWon++ (game loop only)
  ├─ Link another provider ──→ linkWithPopup → users/{uid}.providers
  ├─ Unlink (blocked if last) ──→ unlink
  ├─ Sign out ──→ back to GUEST (new anonymous uid) — see §6
  └─ Delete account ──→ typed confirm → users/{uid}.deletedAt = now
                        + secrets/{uid} purged from live rooms
```

### 5.4 Account deletion — soft delete (confirmed)

Deletion is **soft**: the account is marked and purged only after a grace period,
so an accidental deletion is recoverable.

- Trigger sets `users/{uid}.deletedAt`. The account is treated as inactive
  immediately (signed out, hidden from the UI).
- A purge job removes `users/{uid}` and associated data **after the grace
  period**. Because no scheduled server exists yet, the purge is listed as a
  future Cloud Function; until then the marker is written and purge is manual.
- **Open sub-question:** grace period length. Needs a value before S4.
- **Note:** purging cannot erase `secrets/{uid}` written into rooms the player
  has already left; those are scoped to their own `uid` and become unreachable
  once the account is gone. This is acceptable but should be understood.

### 5.5 Cross-device currency (confirmed)

The account **is** the single source of truth for currency across devices.

- Implication: the wallet must live under `users/{uid}` (or a server-authoritative
  equivalent), never in device-local storage.
- Implication: signing in on a second device must reflect the same balance.
- **This does not authorise designing the currency rules.** As stated in §8, a
  client-writable balance is trivially cheatable and needs server authority.
  Item 4 must specify that first.

---

## 6. Behaviour changes that need explicit sign-off

These alter existing behaviour. **Each needs separate approval before
implementation.**

| # | Change | Risk / note |
| --- | --- | --- |
| B1 | `ensureSignedIn()` gains a "restore permanent session if one exists, else anonymous" branch | Touches the multiplayer entry path |
| B2 | Sign-out returns the player to a **new guest identity**, not their old one | A signed-out account cannot be resumed as a guest |
| B3 | Home screen gains the "Sign in" affordance | UI change on the existing entry screen |
| B4 | Display name is sourced from the account rather than the per-session field | ⚠️ **APPROVED** — account name **replaces** the home-screen per-session name. Affects room `players/{uid}.name` |
| B5 | New `users/{uid}` node + rules | New RTDB surface (rules diff in §8) |

---

## 7. Migration & compatibility

**Guiding rule: existing guests must not lose anything.**

| Concern | Position |
| --- | --- |
| Existing anonymous players | Unaffected. They keep playing; `uid` unchanged; upgrade is opt-in |
| Live multiplayer rooms | Unaffected — room/secret rules never change in this design |
| `secrets/{uid}` scoping | **Unchanged.** Still `auth.uid === $uid`. Account upgrade preserves `uid`, so existing secrets stay readable |
| Accounts in one room, guests in another | Both remain valid; nothing in the room rules requires an account |
| Rollback | Because upgrade only *adds* a credential to an existing `uid`, and no existing rule changes, the feature can be disabled without stranding data |

---

## 8. Required rules changes (proposal — not applied)

Only one addition is needed. Everything else in `database.rules.json` stays as-is.

```jsonc
"users": {
  "$uid": {
    ".read":  "auth != null && auth.uid === $uid",
    ".write": "auth != null && auth.uid === $uid",
    "displayName": { ".validate": "newData.isString() && newData.val().length <= 24" },
    "createdAt":   { ".validate": "newData.isNumber()" },
    "providers":   { ".validate": "newData.hasChildren()" }
  }
}
```

Notes:
- Owner-only read/write; no cross-player reads in this design.
- `secrets`, `rooms`, `matchmaking*` are **left untouched** — deliberately, to
  keep the blast radius of this work minimal.
- **Currency rules are omitted on purpose.** A client-writable wallet is trivially
  cheatable; a real currency design needs server authority (Cloud Functions). That
  is item 4's problem, not this one.

---

## 9. Open questions for the product owner

**Answered:**

- ✅ Dev/staging Firebase project — **does not exist, needs setup** (§3.4)
- ✅ Apple sign-in scope — **all platforms**, not iOS-only (§3.5)
- ✅ Email verification — **required** (§3.6)
- ✅ Verification gate — unverified **may play + set display name, may not hold currency** (§3.6)
- ✅ Display name (B4) — account name **replaces** the home-screen per-session name
- ✅ Account deletion — **soft delete** with a grace period (§5.4)
- ✅ Currency source of truth — **the account**, across all devices (§5.5)

**Still open:**

1. **Soft-delete grace period length** — needs a value before S4 (§5.4).
2. **Which Firebase project do local dev and production each point at?** (§3.4)
3. **S0 project name/ID** — needed to prep the env + config wiring.

All previously blocking questions are answered. S0 and S1 are now unblocked
pending a project to point at.

---

## 10. Suggested implementation slices (each needs separate approval)

| Slice | Content | Depends on |
| --- | --- | --- |
| **S0** | **Set up the dev/staging Firebase project + enable providers** (§3.4) | Apple Developer account (§3.5) |
| **S1** | `users/{uid}` node + rules; write profile on first sign-in | S0 |
| **S2** | Login page: email/password + Google (link-only, no replace) + verification gate (§3.6) | S1, §9.1 answered |
| **S3** | Apple sign-in on all platforms + Capacitor native paths | S2, Apple credentials |
| **S4** | Account page: identity + sign-in methods + sign-out/delete | S2 |
| **S5** | ✅ **Done** — collision handling (§3.2) | S2 |
| **S6** | Wallet placeholder, to be filled by item 4 | Item 4 specified |

S0 is now the true starting point: nothing can be tested until a project exists
with the providers enabled.

**Not designed here:** currency, betting, bonuses, Facebook login, matchmaking,
and any change to gameplay rules, scoring, or timers.
