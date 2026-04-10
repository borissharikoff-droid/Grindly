# TODOS

All current todos completed. Add new items here as they come up.

---

## Pets

### [P2] Animate all 6 pet species (fox, rabbit, capybara, dragon)
**What:** Generate lv1-10 static PNGs via Flux2Pro + 7-mood animated WebPs via kling for the 4 species that currently show emoji only.
**Why:** `getPetLevelImage()` returns `null` for pet_fox, pet_rabbit, pet_capybara, pet_dragon. These pets have full mood/quote/buff systems but no visual portrait. Once cat+dog WebP pipeline is proven, this is a direct extension.
**Pros:** All 6 pets feel alive. Dragon lv10 animated void portrait would be incredible.
**Cons:** 40 static PNGs + 280 WebPs — significant generation batch. Do after cat+dog ships.
**How to start:** Create meta section files in `meta/files/pets/` for each species, following the cat/dog pattern. Generate via `mcp__idly__ToolGenerateResourceFileFromMetaSection`. Extend `getPetLevelImage()` in `pets.ts`.
**Effort:** L (human) / M (CC+gstack)
**Depends on:** Cat+dog animated WebP pipeline shipped

### [P3] Friend list pet mood badge
**What:** Show a pulsing mood-color ring on friend avatars (FriendsPage, FriendProfile) reflecting their pet's current computed mood.
**Why:** Adds social depth — you can see your friend's void cat is hungry or their dog is playful. MOOD_COLOR is already defined, the mood can be computed from `hungerSnapshot + lastFedAt` which are already stored.
**Pros:** Social engagement, encourages feeding pets, visual variety on friend list.
**Cons:** Requires surfacing `hungerSnapshot + lastFedAt` in the public Supabase profiles table (or a new `pet_mood_color` column synced on feed events).
**How to start:** Add Supabase migration to expose pet hunger data on profiles. Add `usePetMoodColor(friendId)` hook. Render `<motion.div>` ring in FriendAvatar component.
**Effort:** M (human) / S (CC+gstack)
**Depends on:** Pet animated portraits shipped

---

## macOS

### [P2] Apple code signing + notarization
**What:** Sign and notarize the macOS build via Apple Developer Program.
**Why:** Without signing, auto-updates are broken on macOS — Gatekeeper blocks installed update binaries. Users must manually download every new DMG.
**Pros:** Auto-updates work. No Gatekeeper friction on first launch. Professional Mac distribution.
**Cons:** Requires $99/yr Apple Developer Program enrollment + CI secret management.
**How to start:** Enroll at developer.apple.com, add `APPLE_ID` + `APPLE_ID_PASSWORD` + `APPLE_TEAM_ID` secrets to GitHub Actions, add `electron-notarize` package, set `hardenedRuntime: true` + `entitlements.plist` in `electron-builder.yml`.
**Effort:** L (human) / M (CC+gstack)
**Depends on:** Apple Developer account enrollment

### [P3] macOS Focus Mode via osascript
**What:** Toggle macOS Do Not Disturb during focus sessions via osascript.
**Why:** `focusMode.ts` returns early on non-win32 — Mac users get no OS-level focus mode.
**How to start:** `osascript -e 'tell application "System Events" to key code 57 using {control down, command down}'` or use the Shortcuts/Focus API on macOS 12+. Gate behind `process.platform === 'darwin'`.
**Effort:** S (human) / S (CC+gstack)

---

## Smart Media Layer (Activity Tracking v2)

### [P2] Now Playing live card in UI
**What:** A compact "Now Playing" card visible during an active session — shows current media context (e.g., "Watching Netflix", "Listening to Spotify") with the category icon and Listener XP accruing in real time.
**Why:** The data model will be rich enough to support it once the Smart Media Layer ships. The card closes the feedback loop for users — they can see their watch/listen time being credited as it happens.
**Pros:** Visible payoff for the Smart Media Layer feature. Encourages intentional media habits.
**Cons:** Needs `watching` category shipped first (Smart Media Layer v1). UI placement TBD (Timer area or a slide-in panel).
**How to start:** After Smart Media Layer ships, extend `ActivitySnapshot` display in `Timer.tsx` or add a `NowPlayingCard` component that reads `currentActivity.category + appName` from sessionStore.
**Effort:** S (human) / S (CC+gstack)
**Depends on:** Smart Media Layer v1 shipped

### [P3] Background video detection via Win32 window scan
**What:** Detect media players running in the background (not the foreground window). Extend the C# `MusicProcessNames` list to a `MediaProcessNames` list that includes VLC, mpv, PotPlayer, MPC-HC, etc. Use the existing background window scan path that `DetectBackgroundMusic` already uses.
**Why:** Currently background music detection works but background video doesn't. A user could be watching a VLC video while coding in VS Code — the VLC window is behind VS Code so it's invisible to the foreground tracker.
**Cons:** Background detection means we're inferring — user may have paused the video. No reliable "is playing" signal from the Win32 path without SMTC.
**How to start:** In the C# tracker subprocess, rename/extend `MusicProcessNames` to include video players. Follow the existing `DetectBackgroundMusic()` path.
**Effort:** S (human) / S (CC+gstack)
**Depends on:** Smart Media Layer v1 shipped
