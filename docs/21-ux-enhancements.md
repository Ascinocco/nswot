# UX Enhancements

Tracked improvements to the nswot desktop app user experience. Each item includes the current behavior, desired behavior, and implementation notes.

---

## 1. Persist Loading States Across Page Transitions

**Current**: Progress state for codebase analysis (and other async operations) is held in React component `useState`. Navigating away unmounts the component and loses all progress — the user returns to a blank state with no indication that analysis is still running in the main process.

**Desired**: Loading/progress states persist across page transitions. If the user navigates to Settings while codebase analysis is running and comes back to Integrations, the progress badges, elapsed timers, and live messages should still be visible.

**Implementation notes**:
- Move async operation state out of component-local `useState` into a global store (React Context or Zustand)
- Key state to persist: `progressMap` (repo → stage/message), mutation pending flags, success/failure results
- The main process already streams `codebase:progress` events via IPC — the global store should subscribe once at app level, not per-component mount
- Consider a `useGlobalProgress` hook that reads from the store and auto-subscribes to IPC events
- Same pattern applies to any future long-running operations (bulk profile import, etc.)

**Files affected**:
- `src/renderer/components/integrations/codebase-setup.tsx` — remove local `progressMap` state, consume from global store
- New: `src/renderer/stores/progress.ts` (or context provider) — global progress state
- `src/renderer/App.tsx` — wrap with progress provider if using Context

---

## 2. Collapsible Sidebar with Hamburger Menu

**Current**: Sidebar is a fixed `w-52` (208px) column that is always visible. It uses `bg-gray-900` while the main content area is `bg-gray-950`, creating a visible color streak down the left side of the app.

**Desired**:
- Sidebar collapses into a hamburger menu button (top-left corner)
- Clicking the hamburger opens the sidebar as an overlay or slide-in panel
- Sidebar and main content share the same background color (`bg-gray-950`) so there's no visible seam when the sidebar is collapsed
- On wider viewports, the sidebar could optionally stay open by default with a toggle to collapse

**Implementation notes**:
- Replace the static `w-52 bg-gray-900` sidebar with a collapsible panel
- Collapsed state: hamburger icon button pinned top-left, main content takes full width
- Expanded state: sidebar overlays or pushes content, same `bg-gray-950` background as main
- Store collapse preference in component state (or localStorage for persistence across sessions)
- Transition: `transform translate-x` with `transition-transform duration-200` for smooth slide
- Border between sidebar and content can use a subtle `border-r border-gray-800/50` instead of background color contrast

**Files affected**:
- `src/renderer/App.tsx` — sidebar layout, collapse state, hamburger button
- Possibly new: `src/renderer/components/layout/sidebar.tsx` — extract sidebar into its own component

---

## 3. Workspace File Browser Auto-Refresh

**Current**: The file browser in the workspace page loads the directory tree on mount via `useDirectory(path)`. It does not auto-refresh — if files change on disk (e.g., codebase repos cloned to `.nswot/repos/`), the user must manually trigger a reload or navigate away and back.

**Desired**: The file browser refreshes its directory listing every time the workspace page is rendered (navigated to). Cloned codebase repos in `.nswot/repos/<owner>/<repo>` should be immediately visible and explorable after analysis completes.

**Implementation notes**:
- Add `refetchOnMount: 'always'` to the `useDirectory` React Query options so it re-fetches whenever the component mounts
- Alternatively, invalidate the directory query cache on route change via React Router's loader or a `useEffect` keyed to location
- Codebase repos are cloned to `<workspace>/.nswot/repos/<owner>/<repo>` — the file browser should traverse into `.nswot/` by default (currently it may be hidden since it starts with `.`)
- Consider showing `.nswot/repos/` as a top-level "Cloned Repositories" section or ensuring dotfiles are visible in the tree

**Files affected**:
- `src/renderer/components/workspace/file-browser.tsx` — refetch on mount
- `src/renderer/hooks/` — directory query configuration (staleTime, refetchOnMount)

---

## 4. Better Codebase Analysis Progress Streaming

**Current**: The provider streams Claude CLI's stderr lines as progress updates, and the UI shows a single truncated line below the repo name. However, Claude CLI using `--print` mode may not emit frequent stderr output, so the message often stays on "Claude is analyzing..." for the entire duration. The user has no visibility into what Claude is actually doing.

**Desired**: The UI provides meaningful, real-time feedback about analysis progress — what files Claude is reading, what tools it's using, how far along it is.

**Implementation notes**:
- **Option A: Switch from `--print` to streaming JSON mode** — Claude CLI supports `--output-format stream-json` which emits one JSON object per line to stdout as the conversation progresses (tool calls, tool results, text deltas). This would give rich, granular progress events.
  - Parse each streaming JSON line in the provider
  - Extract tool call names and arguments (e.g., "Reading package.json", "Grepping for TODO")
  - Forward summarized progress to the UI
  - Collect the final result from the last message
  - Tradeoff: more complex parsing, but much better UX
- **Option B: Enhance stderr parsing** — Claude CLI may emit progress indicators to stderr (spinner text, status updates). Parse and forward these more aggressively.
- **UI improvements regardless of approach**:
  - Show a scrollable log area (last 3-5 messages) instead of a single truncated line
  - Show tool call counts ("Read 12 files, Grep 5 searches")
  - Progress estimation based on typical analysis duration

**Files affected**:
- `src/main/providers/codebase/codebase.provider.ts` — streaming mode, progress parsing
- `src/main/services/codebase.service.ts` — progress event enrichment
- `src/renderer/components/integrations/codebase-setup.tsx` — expanded progress display

---

## 5. Integration Separator Padding

**Current**: The integrations page uses `divide-y divide-gray-800` with `pt-8` wrapper divs. The horizontal divider line sits directly against the bottom of each integration section's buttons and content, with no breathing room between the last element and the separator.

**Desired**: Consistent vertical spacing above and below each separator line. Buttons and content should not touch the divider — there should be visible padding on both sides.

**Implementation notes**:
- Add `pb-8` to each integration section (or the wrapper divs) so there's space below the content before the divider
- Alternatively, replace `divide-y` with explicit `<hr>` elements wrapped in `my-8` for more control
- Target: at least 32px (2rem) of space between the last content element and the divider line, and between the divider and the next section's heading

**Files affected**:
- `src/renderer/routes/integrations.tsx` — separator spacing

---

## Priority Order

1. **Integration separator padding** — trivial CSS fix, immediate visual improvement
2. **Workspace file browser auto-refresh** — small config change, enables exploring cloned repos
3. **Persist loading states** — architectural change, solves the "lost progress" problem
4. **Collapsible sidebar** — medium effort, visual polish
5. **Better codebase analysis streaming** — larger effort, best UX improvement for analysis workflow
