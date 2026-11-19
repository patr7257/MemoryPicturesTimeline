# iOS roadmap: from family web app to paid App Store app

Goal: Memories as a paid iPhone app where each family pays a subscription that
covers its own photo storage. Built the EndoMonday way: Capacitor shell, every
build on GitHub Actions, no Mac, fastlane match signing.

Reference implementation: `C:\Users\pr\repos\1-Personal\EndoMonday` (released on
the App Store, Denmark only). Its paths are given below as `EndoMonday:<path>`.
Learnings log: `C:\Users\pr\.claude\reference\ios-ready-app-notes.md`.

Status markers: PROVEN (worked in EndoMonday on a real device or CI run),
NOT YET SEEN (never confirmed anywhere), VERIFY WHEN RUN (a fact that ages:
check it live before relying on it).

## Decisions made

| Decision | Choice |
|---|---|
| Shell | Capacitor around the existing Next.js app, no native rewrite |
| Path | Phase A: internal TestFlight loading the live site. Later: public paid App Store app with a bundled interface |
| Customers | Many families. Anyone can start a family space, pay, and invite relatives |
| Sign-in | Passkeys (Face ID) and email magic link only. No Google, so Sign in with Apple is not required (guideline 4.8) |
| Payments | In-app auto-renewable subscription (In-App Purchase), via RevenueCat |
| Seller | Enkeltmandsvirksomhed (CVR) on the existing Individual Apple Developer account, same account as EndoMonday |
| Bundle id | `dk.patrickrobel.memories` (permanent after the first upload). Home-screen name "Memories"; App Store name chosen at the app record, must be unique worldwide |

## Open decisions

| Question | Notes |
|---|---|
| Family testers in Phase A: internal or external TestFlight group? | Internal testers must be users of the App Store Connect team (each needs an Apple ID invited with a role). External group: public link or email invite, up to 10,000, but the first build of each version passes Beta App Review |
| Reuse the EndoMonday match repo for signing? | An account has a small limit on distribution certificates. One match repo with one certificate for both apps avoids minting another. VERIFY WHEN RUN |
| Push inside the Phase A app? | Web Push does not work inside a Capacitor WKWebView. Either the family keeps the home-screen PWA for push, or Phase A adds native APNs (copy EndoMonday:`apps/server/src/apns/`) |
| Subscription prices, cap sizes, free trial | Model decided (free tier with a photo cap, premium adds storage and depth features): see `docs/free-vs-premium.md`. Storage cost is small (R2: 0.015 USD per GB-month, egress free; about 0.15 USD a month for 20 GB beyond the free tier), so price on value, not cost |
| What happens to the current family when sign-up opens | E.g. a free "founder" family, migrated as the first space |
| Brand and domain for a product sold to strangers | Today `memories.patrickrobel.dk`. A new domain later means new AASA hosts, passkey rpID and magic-link host: decide before Phase C |
| What a lapsed subscription does | Recommended: read-only, never delete photos without long notice |

## Phase A: internal TestFlight, live site in a shell

The shell loads `https://memories.patrickrobel.dk` (Capacitor `server.url`).
No App Review for internal testers, so guideline 4.2 does not apply yet. Builds
expire after 90 days, so CI uploads a fresh one on a schedule or on demand.

1. **Apple account**: reuse the Individual account and its App Store Connect
   Team key (EndoMonday). Set this repo's GitHub secrets `ASC_KEY_ID`,
   `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID`. PROVEN
2. **Bundle id and capabilities** by API: copy EndoMonday:`scripts/ios-setup.mjs`,
   register `dk.patrickrobel.memories` with Associated Domains (and Push if
   APNs is chosen). PROVEN
3. **App record**: App Store Connect web UI only (the API refuses
   `POST /v1/apps`), after the bundle id exists. Manual step. PROVEN
4. **Capacitor project**: a `mobile/` package with `capacitor.config.json`
   (`appId dk.patrickrobel.memories`, `server.url` the live site, a tiny
   offline page as `webDir`). Generate `ios/` ON CI (`cap add ios`), download
   the artifact, commit it, and write `ios/.gitignore` by hand
   (upload-artifact drops hidden files). Pins: copy EndoMonday:`apps/mobile/package.json`
   (Capacitor 8). VERIFY WHEN RUN
5. **Info.plist**: `ITSAppUsesNonExemptEncryption` NO,
   `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` for the
   upload picker, and `WKAppBoundDomains` if the service worker must register
   inside the webview (otherwise skip registering it in the app).
6. **Sign-in inside the shell**: the live site is first-party in the webview,
   so cookies work.
   - Passkeys: WebAuthn in a WKWebView on the real rpID host should work once
     the app has the `webcredentials:memories.patrickrobel.dk` entitlement and
     the site serves an AASA file. NOT YET SEEN. Fallback: the native
     `@capgo/capacitor-passkey` plugin (PROVEN in EndoMonday).
   - Magic link: today the mail link opens in Mail or Safari, so the session
     lands in Safari, not the app. Fix: mail link on a dedicated path
     (`/app/link?token=`) matched as a universal link, plus an "Open in the
     app" button on a custom URL scheme as a fallback. PROVEN via the button;
     the direct universal link is NOT YET SEEN (Apple CDN lag).
7. **AASA file**: a route handler serving
   `/.well-known/apple-app-site-association` (webcredentials plus applinks on
   `/app/link` only, Team ID from env). Pattern:
   EndoMonday:`apps/server/src/apple-app-site-association.ts`. Check Apple's
   copy at `https://app-site-association.cdn-apple.com/a/v1/memories.patrickrobel.dk`
   before installing a fresh build.
8. **Icon**: 1024 px, opaque, no alpha, from `src/app/icon.svg` (extend
   `scripts/gen-app-icons.mjs`). PROVEN requirement
9. **CI**: this repo has no `.github/` yet. Copy EndoMonday:`.github/workflows/ios.yml`
   (label-triggered, because macOS minutes bill about 10 times Linux; runner
   from `vars.IOS_RUNNER`, falling back to `macos-15-intel` when arm64 has no
   capacity) and EndoMonday:`apps/mobile/fastlane/Fastfile` (lane `beta`:
   `setup_ci`, API key, `match appstore`, manual signing, build number from
   the run number, `upload_to_testflight` with skip-waiting). Use a
   `pull_request` trigger for the first builds (workflow_dispatch needs the
   file on the default branch). PROVEN
10. **TestFlight group and testers** by REST from CI (EndoMonday
    `ios-setup.mjs` phase `testers`). PROVEN
11. **Version gate**: unchanged in Phase A (the shell reloads the live site).

## Phase B: business setup (runs in parallel with A and C)

1. Accountant meeting with the question list below.
2. CVR for an enkeltmandsvirksomhed on `https://virk.dk` (MitID, free, often
   within a day; secondary sources). VERIFY WHEN RUN
3. Moms registration if the accountant says App Store income counts toward
   the 50,000 DKK threshold.
4. App Store Connect, Business: Paid Apps Agreement, bank account, tax forms.
5. Small Business Program enrollment (15% commission under 1M USD proceeds).
   Year-two subscription rate and the EU terms (DMA, effective 1 Oct 2026)
   are unresolved: read Apple's live pages. VERIFY WHEN RUN
6. EU Digital Services Act: declare trader status for this app. An
   Individual trader's address (or P.O. box), phone and email are published
   on the product page in all EU storefronts. Verification can take weeks.
   EndoMonday is declared non-trader and must switch before charging.
7. Legal pages: privacy policy, terms, support. Template:
   EndoMonday:`apps/web/src/copy/legal.ts`. Plus a data processing agreement
   for customers (families are controllers of their photos; Memories is likely
   a processor: accountant or lawyer to confirm).
8. Vendor DPAs: Cloudflare (`https://www.cloudflare.com/cloudflare-customer-dpa/`)
   and Neon (`https://neon.tech/pdf/DPA.pdf`). Check that the R2 bucket was
   created with the `eu` jurisdiction (set at creation, unchangeable), not only
   an EU location hint. If not, a new bucket and a copy are needed.

## Phase C: product changes for the paid public app

Ordered by dependency. Each ships with its tests.

1. **Multi-tenancy** (largest change). Today there is no family or tenant id
   anywhere; visibility is per trip, `members.email` is unique across the
   whole database, and super admins (env) see every trip.
   - New `families` table; `family_id` on `people`, `trips`, `members`;
     comments, photos and push follow through trips and members.
   - Per-family owner and admin roles replace the global `SUPER_ADMIN_EMAILS`
     for content; a separate platform-admin notion for support.
   - Every lookup in `src/lib/access.ts` and every unscoped read (all members,
     all users, all people, all push subscriptions, the global per-day push
     dispatch log) gets the family filter. Policy changes in
     `src/lib/access-policy.ts` with unit tests.
   - R2 keys move under a family prefix (`families/{familyId}/...`) for usage
     accounting and full deletion.
   - Migration: the current family becomes the first space.
2. **Open sign-up and onboarding**: create a family, invite relatives by
   email. Today login is allowlist-only (`members`, env lists).
3. **Storage accounting and quotas**: a bytes column per photo, usage per
   family, quota enforced at presign with a signed content length (today the
   30 MB limit is only what the client declares). Delete R2 objects when a
   vacation is deleted (today they are orphaned) and add an orphan sweeper
   for failed deletes and never-finalized uploads.
4. **Bundled interface (static export)** for guideline 4.2. Pattern:
   EndoMonday:`apps/web/next.config.ts` (`APP_TARGET` switch: export for the
   app, standalone for the web) and EndoMonday:`apps/web/scripts/check-app-export.mjs`.
   - Pages and layouts with server data must become client-gated (derive the
     current list with a grep for `getViewer`, `requireSession`, `notFound`,
     `redirect(` under `src/app`).
   - Server actions in `src/actions` become route handlers callable with a
     bearer token.
   - `trips/[id]` routes become `?id=` detail pages.
   - `next.config.ts` headers and the `version.json` route stay web-only
     (`.web.ts` suffix pattern).
   - The version gate must not reload a bundled app into nothing: in the app
     it should point to a store update instead.
5. **Device credential auth**: bearer token for the app, cookies stay on the
   web. Pattern: EndoMonday:`apps/server/src/device-routes.ts`,
   `packages/auth/src/device-credential.ts` (hashed token in a
   `device_credential` table), `apps/web/src/lib/device-auth.ts`. Native
   passkey plugin with origin `https://memories.patrickrobel.dk`, Keychain
   via secure storage (`afterFirstUnlockThisDeviceOnly`), CORS and trusted
   origins accepting `capacitor://localhost` only with a bearer and no cookie.
   A reviewer login code for App Review (EndoMonday decision 63).
6. **Image proxy with bearer auth**: `<img>` tags cannot send an
   Authorization header, and `/api/img/[id]/[size]` authenticates by cookie
   today. Needs short-lived signed URLs or a signed token in the query.
   Not solved in EndoMonday (no image-heavy content). NOT YET SEEN
7. **Subscriptions**: RevenueCat (`@revenuecat/purchases-capacitor`; free up
   to 2,500 USD monthly tracked revenue, then 1%). VERIFY WHEN RUN. The family
   owner pays, members are free. Entitlement mirrored server-side from
   RevenueCat webhooks, so the web app of a paying family is unlocked too
   (guideline 3.1.3(b): fine as long as In-App Purchase is offered in the
   app). Restore Purchases button. No buy buttons or links to other payment
   methods in the app (3.1.1(a), non-US storefronts).
8. **Native value** (also against 4.2):
   - Native photo picker that keeps GPS and date (today the iPhone web picker
     can strip location). HEIC must then be accepted (today rejected with
     415): convert on the client or in sharp.
   - APNs push in the app, Web Push kept on the web: `push_subscriptions`
     needs a platform/token shape (EndoMonday `device_push_token`), and the
     prune-on-410 logic in `src/lib/push/send.ts` is the seam.
   - Share sheet for photos (`navigator.share` with a `File` is PROVEN in
     EndoMonday).
9. **Account and data rights**: in-app account deletion (guideline 5.1.1(v);
   today `removeMember` keeps the user, photos and comments), family deletion
   by the owner including R2 objects, and a data export.
10. **User-generated content (guideline 1.2)**: content is private to a
    family, but review may still ask for a report mechanism and published
    contact info. Prepare the review notes.

## Phase D: App Store submission

1. Listing text, App Privacy labels (data linked to the account, App
   Functionality only, no tracking) and review notes. Template:
   EndoMonday:`docs/app-store-listing.md`, checklist
   EndoMonday:`docs/app-store-readiness.md`.
2. Screenshots rendered headless with Playwright at 1206x2622
   (EndoMonday:`apps/web/scripts/store-screenshots.mjs`). PROVEN
3. Subscription products in App Store Connect (group, tiers, localized
   descriptions, review screenshot) and in RevenueCat.
4. Version string in the app equals the App Store Connect version record
   (builds attach only to the matching record). PROVEN trap
5. Release in Denmark first, then widen.
6. No deploys during a review window: the reviewer hits the live API.

## Ongoing after launch

- Apple's yearly Xcode and SDK floor for uploads. VERIFY WHEN RUN
- Backups with a tested restore (Neon point-in-time restore; R2 has no
  backup today).
- Support mailbox and response promise from the support page.

## Questions for an accountant or lawyer

1. CVR timing, and hobby versus business classification for subscription
   income.
2. Do App Store payouts count toward the 50,000 DKK moms threshold, and is it
   a calendar-year or rolling 12-month test? How is Apple's role as
   commission agent treated for Danish VAT?
3. Enkeltmandsvirksomhed now versus ApS later: when does the switch pay off,
   and what does moving the apps to an Organization account mean for the
   seller name?
4. Publishing an address under the Digital Services Act: is a P.O. box
   enough?
5. GDPR: controller or processor for families' photos, the customer DPA,
   children's photos, and transfer risk of US-parented vendors (Cloudflare,
   Neon).
6. Liability when a family loses photos: terms wording, insurance.
