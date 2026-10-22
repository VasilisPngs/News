# Project Instructions

## Git & repository workflow
- Push changes directly to `main`; do not open pull requests.
- Publish every completed change set as exactly one commit.
- This file is shared by VasilisPngs/AppUpdater, VasilisPngs/Adblock, VasilisPngs/AdblockDNS, VasilisPngs/GymTracker and VasilisPngs/News: every change to it is made identically in all five repositories at the same time.

## General rules
- Follow only Google's official guidance and rules: Material Design, the Android developer documentation and Google's own libraries and samples. When the user asks for something beyond them, first say plainly that it departs from Google and which guideline it breaks, and go ahead only once they confirm. A confirmed departure changes the code only, never this file, which stays on Google's guidance by default; a departure already in the code is the user's settled decision, so ask before reverting it.
- Use what Google and the platform already provide before writing anything: Google's components with their defaults, libraries and samples, and on the web the browser's built-in elements and APIs. Write custom code only where nothing official exists or the official one does not behave as Google's guidance requires.
- Frontend, UI and UX are uniform, symmetrical and consistent across screens and apps, with correct alignment and geometry, always by Google's measurements.
- This file never fixes spacings or dimensions: every size, spacing, corner, breakpoint and threshold comes from Google's current tokens, guidelines and sources, so the apps follow Google when its values change.
- Accessibility, reduced motion included, follows Google's guidance on every platform, using the platform's built-in semantics before anything custom.
- Do the work end to end.
- Do not undo settled decisions or weaken requirements without a real technical reason.
- Prefer root-cause fixes and the simplest architecture that fully satisfies the requirements.
- Remove dead code, obsolete compatibility layers and workarounds, unused dependencies, resources, permissions and configuration.
- Keep code clean, direct, idiomatic and maintainable.
- All code is written in English.
- Source contains no comments of any kind: no inline, header, licence, KDoc or TODO comments and no commented-out code.
- Use the latest appropriate official technologies, APIs, libraries and tools, tracking the newest published build in any release channel, including preview, alpha, beta, release candidate and canary.
- Latest applies to APIs, not only to version numbers: check every API, library, pattern and tool against what Google's official documentation recommends today and migrate whatever is deprecated, superseded or advised against, such as SharedPreferences to DataStore or AndroidViewModel to ViewModel. Do this for all code a change touches, and across the whole codebase whenever dependencies are updated, reading their release notes for deprecations and replacements.
- A newer toolchain is only acceptable while the signed release APK still installs on a release device; never compile against a preview Android platform, which stamps the package as preview-built and makes it unparseable on release builds.
- Do not add a numeric product version to the visible product identity, release name, APK filename, release tag, or API User-Agent unless explicitly requested.

## Android
- Android always means the newest finished release in Google's documentation, named by its version number and API level: the apps compile against it, target it and are tested on it, and every statement about Android behavior refers to it, never to an older release.
- The product design is strictly Google's latest Material 3 Expressive, never Material 2 or earlier Material 3: the official Compose Material 3 components inside `MaterialExpressiveTheme` with `MotionScheme.expressive()`, always the Expressive overload or variant where one exists, keeping the components' defaults, Google's rounded shapes included. The framework has no Material 3 Expressive window theme, so the platform theme is `Theme.DeviceDefault.DayNight`, never the Material Design 1 `Theme.Material`.
- The default colors are the web apps' blue: the Material 3 color roles that Material Color Utilities generates with `SchemeTonalSpot`, spec version 2025, from the seed `#4285F4`, every role in light and dark, written as the generated values into `lightColorScheme()` and `darkColorScheme()` inside `MaterialExpressiveTheme`. As in Google's Now in Android sample, Settings keeps two separate settings: Theme, a dialog with the radio buttons System default, Light and Dark, set to System default; and Dynamic color, off by default, a switch because Google's settings guidance gives an on/off setting a switch, never radio buttons. With Dynamic color on, every color comes from the device's `dynamicLightColorScheme` or `dynamicDarkColorScheme` in the chosen theme, always available because the minimum SDK is 34 (Android 14). No color is hand-picked; every value comes from Material Color Utilities or the device.
- Each screen has a single-row `TopAppBar` with the plain screen name as its title, and the entries of each list are Material 3 Expressive `SegmentedListItem`s joined into a segmented group with Google's `segmentedShapes` and `SegmentedGap`, in the surface container color of Google's samples.
- Frontend, UI and UX keep uniform, symmetric and consistent geometry with correct alignment, as Material 3's layout guidance defines it: each breakpoint's window margins, the top app bar's title and actions on the same edges as the content, and one alignment line for text and controls.
- Icons come from Material Symbols Rounded, except a third party's own logo where the interface names that third party.
- Text uses Google Sans from Google Fonts through Compose downloadable fonts.
- Use Google's blur and transparency effects wherever Google's guidance uses them, such as the window blur behind dialogs.
- Add an R8 keep rule only for code that a missing rule demonstrably breaks.

## Web
- Web apps follow the same Google guidance as Android: Material 3 Expressive as m3.material.io defines it. Google ships no Material 3 Expressive library for the web and Material Web is in maintenance mode, so the components are written in plain HTML, CSS and JavaScript from the official Compose Material 3 tokens, never from third-party ports.
- The web apps run as home-screen apps on the newest iOS and in the newest Chrome on Windows: a web feature is used once both support it, and a prefix or fallback that either still needs stays.
- Colors are the Material 3 color roles that Material Color Utilities generates with `SchemeTonalSpot`, spec version 2025, from the seed `#4285F4`, written as CSS custom properties with `light-dark()`; the web has no dynamic color.
- Text uses Google Sans woff2 files from Google Fonts, served by the app itself in the latin, latin-ext and greek subsets, with the Material 3 type scale; every form control, text areas included, inherits it, so typed text uses the body large style.
- Icons are Material Symbols Rounded inline SVG paths, never the Outlined or Sharp styles: unfilled (FILL 0) when not selected and filled (FILL 1) only in the selected state, as Google's navigation bar samples do; an icon whose unfilled and filled versions are identical is not used for a selectable item.
- Motion uses the Expressive spring tokens converted to CSS `linear()` easings with their settle durations.
- The app has the navigation bar at compact widths and the navigation rail from medium widths up, as Google's window size classes define; every screen has a single-row top app bar with the plain screen name, and the entries of each list form a segmented group of surface-container items with Google's segmented gap, shapes and interaction shapes, as on Android.
- Input, confirmations and choices use Material dialogs, messages use snackbars, and loading uses the LoadingIndicator, contained for pull to refresh.
- Overflow actions open the Material 3 Expressive menu: groups of items in surface container low with the menu's gaps and outer corners; long lists to pick from open a modal bottom sheet in surface container low with its top corners, drag handle and maximum width, all as Google's tokens define.
- Choices such as theme, language or a category open a dialog with radio buttons, never the platform's native select.
- A setting that holds a value is a list row showing that value and opens a dialog to change it, as Android Settings' Private DNS does; a list the user adds to ends with an add row that opens a dialog, never an inline form; an empty section shows only its add row, and a full empty state is kept for a screen whose main content is empty.
- Lists are edited in place, never through an edit mode: a leading drag handle reorders, a trailing icon button removes, and a destructive removal asks first in a dialog.
- Layout uses Google's measurements, read from the current Compose Material 3 tokens and sources rather than fixed here, and is checked in the browser on phone and desktop before every push: list item heights by line count, side padding and the spacing between leading, content and trailing; the top app bar title inset with and without the navigation icon, with its action icons side by side; text inside a container aligns with the section headings, and a trailing control's visible edge with the content edge; on wider windows the top app bar lines up with the content column.
- A swipe acts as Compose's `SwipeToDismissBox`, with its positional and velocity thresholds: one gesture, never a half swipe that reveals a button to tap; past a threshold the action completes, anything less springs back, and the row's background turns from surface container highest to error container with the action's icon once the threshold is passed.
- The app icon is a Material Symbols Rounded symbol, unfilled, sized by Google's adaptive icon guidance.

## Cloudflare
- Every recurring D1 query reads through an index, a partial index when it only looks for rows waiting for work. D1 counts every row read, rows of temporary sort tables included, against the free daily limit of 5,000,000 that all databases of the account share.
- Check every new or changed query with `EXPLAIN QUERY PLAN` and measure the `rows_read` of the D1 query API before it ships, and read the day's D1 analytics after the deploy.
- Cache values that change slowly, such as a percentile threshold, instead of recomputing them on every run.

## Verification
- While the Java target is newer than the ASM bundled with lint, the build adds `androidLintTool(platform(...))` with the newest `org.ow2.asm:asm-bom` from the version catalog; without it lint still passes but skips every class with "Unsupported class file major version".

## Sources
- Never take Google's guidance, APIs, versions or values from memory, earlier notes or saved links: read the current official source at the time of the work, and find a moved or renamed page again from these entry points.
- Android, Firebase, Google Developers and Kotlin documentation, the Android design guides included: Google's Android Knowledge Base through Android CLI, `android docs search` and then `android docs fetch`, and Google's official Android skills through `android skills find`. Android CLI comes from developer.android.com/tools/agents; install it when it is missing, run `android update` before use, and pass `--no-metrics` to every command so it sends no usage data.
- Material Design, Material 3 Expressive included: m3.material.io, starting from its home page and blog page, which list the newest pages that its sitemap.xml and feed miss, and using the sitemap for the rest; the site renders with JavaScript, so read it with headless Chromium, never a plain fetch.
- Compose Material 3 measurements and behavior: the androidx-main branch of platform/frameworks/support on android.googlesource.com under compose/material3, with the component tokens in its tokens folder and Google's samples in its samples folder; list a folder with `?format=JSON` and read a file with `?format=TEXT`.
- Colors from Material Color Utilities, icons from Material Symbols, fonts from Google Fonts, versions from Google Maven and the AndroidX release notes, the web platform from web.dev and developer.chrome.com, and the research and stories behind Google's design from design.google.
- Libraries and services outside Google: their maintainers' current documentation and release notes.
- This file names only these entry points, never individual pages.
