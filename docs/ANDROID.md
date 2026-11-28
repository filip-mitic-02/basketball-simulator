# Android app (Capacitor)

The Android app is a thin native shell around the website. It opens the Vercel site full screen (no address bar), so every
website update is live in the app immediately, with no new Play Store release. The shell adds three things a plain website cannot do:
Google sign-in inside the app, AdMob ads, and the Play Store listing.

Everything here was written without being able to build or run Android in the development sandbox. **Treat the first build as a test**:
check sign-in, a rewarded ad and an interstitial on a real phone before going further.

## What is in `app/`
- `capacitor.config.json`: app id `app.perfectseason.coach` (change it now, it cannot change after the first Play release) and `server.url` (your Vercel domain).
- `android/`: the generated Android Studio project. AdMob application id and the `AD_ID` permission are already in `AndroidManifest.xml`.
- Plugins: `@capacitor-community/admob` (ads + consent form) and `@capgo/capacitor-social-login` (native Google sign-in).

## One-time setup
1. Install Android Studio and Node 20+.
2. In `app/`: `npm install`, then edit `capacitor.config.json`: put your real domain in `server.url`.
3. `npx cap sync android`, then `npx cap open android` (opens Android Studio). Let Gradle sync finish.

## Google sign-in (Google Cloud Console, the project that already has your web client)
The server (`api/auth/native.js`) checks the ID token against your existing `GOOGLE_CLIENT_ID`, so the app must use that same **web** client id
(the app fetches it from `/api/auth/native`). Google also needs an **Android** OAuth client so the native sign-in is allowed:
1. APIs & Services, Credentials, Create credentials, OAuth client ID, type **Android**.
2. Package name: the `appId` from `capacitor.config.json`.
3. SHA-1: for testing, `./gradlew signingReport` in `app/android` (debug key). For the Play release, use the **App signing key SHA-1** from Play Console, App integrity.
   Create one Android client per SHA-1 you use (debug and release).
No client secret is used in the app.

## Ads (AdMob)
1. Create an AdMob account, add an Android app, and create two ad units: **Rewarded** and **Interstitial**.
2. Put the real ids in `public/ads.js` (`IDS`) and the real **app id** in `app/android/app/src/main/AndroidManifest.xml`.
   Until then the app uses Google's public test ids, which are safe to click.
3. In AdMob, Privacy & messaging: create a GDPR (EEA/UK) message so the consent form can show.
4. Never click your own live ads. Use your phone as a test device in AdMob.
Where ads appear: one interstitial after a finished season (after the result is shown), and two optional rewarded ads
(an extra re-spin during the draft, an extra trade during the season). On the website the same buttons show a 5 second sponsor break instead.

## Build and publish
1. Android Studio: Build, Generate Signed App Bundle (AAB). Create a keystore and **back it up**; losing it means losing the ability to update the app.
   Prefer Play App Signing (Google holds the final key).
2. Play Console (one-time 25 USD developer account, identity check): create the app, upload the AAB to an internal/closed test first.
   New personal accounts must run a closed test with a minimum number of testers for a number of days before production: check the current rule in Play Console.
3. Store listing needs: privacy policy URL `https://YOUR-DOMAIN/privacy` (fill in the contact email in `public/privacy.html` first), icon 512x512,
   feature graphic 1024x500, phone screenshots, short and full description.
4. App content forms: Data safety (collects name; ads use the advertising id; account deletion supported in-app and via the policy page), Ads declaration (yes),
   target audience (not for children), content rating questionnaire.
5. Do not use NBA or EuroLeague logos or club badges in the listing or icon.

## Updating
Website changes: just deploy to Vercel. Native changes (plugins, ad ids, icon, manifest): `npx cap sync android`, bump `versionCode` in
`app/android/app/build.gradle`, build a new AAB and upload it.
