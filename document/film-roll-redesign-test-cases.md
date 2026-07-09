# Film Roll Redesign — Test Cases

> Comprehensive test cases for the film cupboard badge removal and roll detail stepper redesign.
> These are written for future conversion to a test framework (vitest, bun test, playwright test).

## Categories

1. Cupboard Badge Removal
2. Step Defaulting
3. Step Switching
4. Stepper Navigation
5. Stats Cards
6. Photobook Page
7. OAuth Redirect
8. Edge Cases

---

## 1. Cupboard Badge Removal

### Test: Canister cards render without status badge
- **Given**: The user is logged in and on the film cupboard page (`/film`) with at least one film roll
- **When**: The canister grid renders
- **Then**: No element inside any canister article has the status badge class pattern (`rounded-full border px-2 py-1 text-[9px]` with `status.colorClass`)
- **Priority**: critical

### Test: Status filter dropdown still filters rolls after badge removal
- **Given**: The user is on `/film` with multiple rolls of different statuses (e.g., UNUSED, PROCESSED)
- **When**: The user selects "Processed" from the status filter dropdown
- **Then**: The canister grid updates to show only rolls with status `PROCESSED`, and the roll count text reflects the filtered count
- **Priority**: critical

### Test: Clicking a canister card navigates to the roll detail page
- **Given**: The user is on `/film` with at least one film roll canister visible
- **When**: The user clicks a canister card
- **Then**: The browser navigates to `/film/rolls/{rollId}` (the base roll detail page)
- **Priority**: critical

---

## 2. Step Defaulting

### Test: New roll with no processing, no drive, no photos defaults to Film step
- **Given**: A film roll exists with no `lab_name`, no `processing_date`, zero costs, no `drive_folder_id`, and zero photos
- **When**: The user navigates to `/film/rolls/{rollId}` (no `?step=` param)
- **Then**: The active step is `film`, the Roll Details aside (cover image, film_name, brand inputs) is visible, and the Processing and Drive cards are NOT visible
- **Priority**: critical

### Test: Roll with processing details but no drive folder defaults to Drive step
- **Given**: A film roll exists with `lab_name` set and/or `processing_cost > 0` (so `hasProcessingDetails = true`), but no `drive_folder_id` (`hasDriveFolder = false`)
- **When**: The user navigates to `/film/rolls/{rollId}` (no `?step=` param)
- **Then**: The active step is `drive`, the Google Drive card is visible, and the Film and Processing cards are NOT visible
- **Priority**: critical

### Test: Roll with processing and drive but no photos defaults to Drive step
- **Given**: A film roll exists with `hasProcessingDetails = true` and `hasDriveFolder = true`, but zero synced photos (`hasSyncedPhotos = false`)
- **When**: The user navigates to `/film/rolls/{rollId}` (no `?step=` param)
- **Then**: The active step is `drive` (photobook is not a valid base-page step; `defaultStep` falls to first incomplete which is `drive` since `canShowPhotobook = false`), the Google Drive card is visible
- **Priority**: medium

### Test: All-complete roll defaults to Film step
- **Given**: A film roll exists where `hasProcessingDetails = true`, `hasDriveFolder = true`, and `hasSyncedPhotos = true` (so `canShowPhotobook = true`, all steps complete)
- **When**: The user navigates to `/film/rolls/{rollId}` (no `?step=` param)
- **Then**: The `defaultStep` resolves to `'film'` (all steps complete, `find` returns undefined, fallback to `'film'`), the Roll Details aside is visible
- **Priority**: medium

---

## 3. Step Switching

### Test: Clicking stepper step 2 changes URL and shows Processing card
- **Given**: The user is on `/film/rolls/{rollId}` with the stepper visible
- **When**: The user clicks the "Processing" step (step 2) on the stepper
- **Then**: The URL changes to include `?step=processing`, the Processing card (lab name, costs, date, Save Processing button) becomes visible, and the Film step content is no longer visible
- **Priority**: critical

### Test: Clicking stepper step 3 changes URL and shows Drive card
- **Given**: The user is on `/film/rolls/{rollId}` with the stepper visible
- **When**: The user clicks the "Drive" step (step 3) on the stepper
- **Then**: The URL changes to include `?step=drive`, the Google Drive card (folder input, Sync Metadata button, Connect Google link) becomes visible, and other step content is no longer visible
- **Priority**: critical

### Test: Invalid ?step= value falls back to default step
- **Given**: A film roll exists with no processing details (`defaultStep` = `'processing'` is NOT applicable; actually `defaultStep` = first incomplete; for a new roll it's `'processing'`)
- **When**: The user navigates to `/film/rolls/{rollId}?step=invalid`
- **Then**: The page does not crash, `activeStep` falls back to `defaultStep` (first incomplete step), and the corresponding default step's card content is visible
- **Priority**: critical

### Test: ?step=photobook on base page falls back to default step
- **Given**: The user is on the base roll page (`/film/rolls/{rollId}`)
- **When**: The user navigates to `/film/rolls/{rollId}?step=photobook`
- **Then**: The `?step=photobook` value is NOT in the valid list `['film', 'processing', 'drive']`, so `activeStep` falls back to `defaultStep`; the page renders the default step's content (does NOT show photobook content on the base page — photobook is a separate route)
- **Priority**: medium

---

## 4. Stepper Navigation

### Test: Clicking stepper step 4 navigates to the photobook route
- **Given**: The user is on `/film/rolls/{rollId}` with the stepper visible
- **When**: The user clicks the "Photobook" step (step 4) on the stepper
- **Then**: The browser navigates to `/film/rolls/{rollId}/photobook` (a separate route, not a query param change)
- **Priority**: critical

### Test: Stepper on photobook page links back to base page
- **Given**: The user is on `/film/rolls/{rollId}/photobook` with the stepper visible (activeStep = `'photobook'`)
- **When**: The user clicks the "Film" step (step 1) on the stepper
- **Then**: The browser navigates to `/film/rolls/{rollId}?step=film` (back to the base page with Film step active)
- **Priority**: critical

### Test: Active step gets distinct visual styling
- **Given**: The user is on `/film/rolls/{rollId}?step=processing`
- **When**: The stepper renders
- **Then**: The "Processing" step link has the active styling (`border-accent-sage bg-pastel-olive-soft text-text-primary`), and other steps do not have the `isActive` class combination (completed steps may share the same colors but active is checked first in the `cn()` ternary)
- **Priority**: medium

---

## 5. Stats Cards

### Test: Stats cards visible on base page regardless of active step
- **Given**: The user is on `/film/rolls/{rollId}` with any `?step=` value (film, processing, drive, or invalid)
- **When**: The page renders
- **Then**: The StatsCards section (Total Cost, Frames, Cost/Frame, Cost/Successful Photo) is always visible above or below the stepper, independent of which step content is shown
- **Priority**: medium

### Test: Stats cards visible on photobook page
- **Given**: The user is on `/film/rolls/{rollId}/photobook`
- **When**: The page renders
- **Then**: The StatsCards section is visible on the photobook page (same 4 cards: Total Cost, Frames, Cost/Frame, Cost/Successful Photo)
- **Priority**: medium

---

## 6. Photobook Page

### Test: Empty state when no processing details
- **Given**: A film roll exists with `hasProcessingDetails = false` (no lab_name, no processing_date, zero costs)
- **When**: The user navigates to `/film/rolls/{rollId}/photobook`
- **Then**: The page shows the empty state with text "Processing comes before the photobook." and subtitle "Add the lab, date, or costs first. Drive setup can happen now or later." The photo grid is NOT visible
- **Priority**: critical

### Test: Empty state when processing done but no photos
- **Given**: A film roll exists with `hasProcessingDetails = true` but `hasSyncedPhotos = false` (zero photos)
- **When**: The user navigates to `/film/rolls/{rollId}/photobook`
- **Then**: The page shows the empty state with text "Ready for Drive sync." and subtitle "Processing is tracked. Link or sync the Google Drive folder to open this photobook." The photo grid is NOT visible
- **Priority**: critical

### Test: Photo grid renders with Favorite and Cover buttons when processing and photos exist
- **Given**: A film roll exists with `hasProcessingDetails = true` AND `hasSyncedPhotos = true` (at least 1 photo)
- **When**: The user navigates to `/film/rolls/{rollId}/photobook`
- **Then**: The photo grid renders (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`), each photo article has a thumbnail link, a "Favorite" button (Heart icon, variant toggles to `primary` when `is_favorite` is true), and a "Cover" button (Star icon, variant is `primary` when `roll.cover_photo_id === photo.id`)
- **Priority**: critical

### Test: Favorite shots carousel uses scroll-snap
- **Given**: A film roll exists with `canShowPhotobook = true` and at least 1 favorite photo (`is_favorite = true`)
- **When**: The user navigates to `/film/rolls/{rollId}/photobook`
- **Then**: The "Favorite Shots" card is visible, the carousel container has classes `flex gap-3 overflow-x-auto snap-x pb-2`, and each carousel item has class `snap-start` (with `h-28 w-36 shrink-0`). No external carousel library is used
- **Priority**: medium

---

## 7. OAuth Redirect

### Test: Connect route accepts roll_id and sets film_google_oauth_roll_id cookie
- **Given**: The user is authenticated and has a valid session cookie
- **When**: The user's browser requests `/api/film/integrations/google/connect?roll_id=550e8400-e29b-41d4-a716-446655440000` (valid UUID)
- **Then**: The response is a 302 redirect to Google's OAuth URL, and the `Set-Cookie` header includes `film_google_oauth_roll_id=550e8400-e29b-41d4-a716-446655440000` with `httpOnly`, `sameSite=lax`, `maxAge=600`, `path=/`, and `secure` in production
- **Priority**: critical

### Test: Callback redirects to roll page when roll_id cookie exists
- **Given**: The OAuth callback is invoked with valid `code` and `state` params, and the `film_google_oauth_roll_id` cookie is set to a valid roll UUID
- **When**: The callback route processes the request and token exchange succeeds
- **Then**: The response redirects (302) to `/film/rolls/{rollId}?google=connected`, and both cookies (`film_google_oauth_state` and `film_google_oauth_roll_id`) are deleted via `Set-Cookie` with empty/expired values
- **Priority**: critical

### Test: Callback redirects to cupboard when roll_id cookie is missing
- **Given**: The OAuth callback is invoked with valid `code` and `state` params, but the `film_google_oauth_roll_id` cookie is NOT set (missing or expired)
- **When**: The callback route processes the request and token exchange succeeds
- **Then**: The response redirects (302) to `/film?google=connected` (fallback), and the `film_google_oauth_state` cookie is deleted
- **Priority**: critical

### Test: Callback error paths redirect with ?google=error instead of returning JSON
- **Given**: The OAuth callback is invoked with missing `code`, missing `state`, or a `state` that doesn't match the `film_google_oauth_state` cookie
- **When**: The callback route processes the request
- **Then**: The response is a 302 redirect (NOT a JSON response), the redirect URL contains `?google=error` (to `/film/rolls/{rollId}?google=error` if roll_id cookie exists, or `/film?google=error` if not), and both cookies are deleted
- **Priority**: critical

### Test: Both cookies deleted after callback regardless of success or failure
- **Given**: Both `film_google_oauth_state` and `film_google_oauth_roll_id` cookies are set
- **When**: The OAuth callback is invoked (with any params — valid, invalid, or error-inducing)
- **Then**: The response `Set-Cookie` headers include deletion directives for BOTH `film_google_oauth_state` and `film_google_oauth_roll_id` (both set to empty/expired)
- **Priority**: high

---

## 8. Edge Cases

### Test: Roll not found on base page shows not-found state
- **Given**: The user navigates to `/film/rolls/{nonExistentRollId}` where the API returns a 404 or error
- **When**: The `loadRoll` fetch fails (`rollRes.ok` is false) or returns null data
- **Then**: The page shows a not-found state with a "Back to Film Journal" link and a Card with text "Film roll not found." — no crash, no blank screen
- **Priority**: medium

### Test: Roll not found on photobook page shows not-found state
- **Given**: The user navigates to `/film/rolls/{nonExistentRollId}/photobook` where the API returns a 404 or error
- **When**: The `loadRoll` fetch fails (`res.ok` is false) or returns null data
- **Then**: The page shows a not-found state with a "Back to Film Journal" link and a Card with text "Film roll not found." — no crash, no blank screen
- **Priority**: medium

### Test: Mobile stepper layout uses single column on mobile, 4 columns on desktop
- **Given**: The user is on a roll detail page (base or photobook) with the StepStepper rendered
- **When**: The viewport is mobile width (below `md` breakpoint, < 768px)
- **Then**: The stepper section uses `grid gap-3` with no column count (defaults to `grid-cols-1`), showing all 4 steps stacked vertically. On desktop (≥ 768px), the stepper uses `md:grid-cols-4`, showing all 4 steps in a single row
- **Priority**: low

### Test: Clicking stepper on active step is a no-op
- **Given**: The user is on `/film/rolls/{rollId}?step=processing` and the "Processing" step is active
- **When**: The user clicks the "Processing" step link on the stepper
- **Then**: The URL remains `/film/rolls/{rollId}?step=processing`, the page does not crash, and no visible navigation or content change occurs (the Link href is the same as the current URL)
- **Priority**: low
