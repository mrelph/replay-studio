# Narration release 1 (talk on a frame) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coach records short voice clips (hold `N` or the mic button); a clip recorded on a paused frame holds that frame for its length, a clip recorded while playing goes over the moving video with the game sound lowered; clips show on a Voice lane, undo/redo, save in the project file and are mixed into MP4 exports.

**Architecture:** Voice clips are their own list in a Zustand store (`voiceStore`), with the recorded audio kept in a side registry keyed by clip id. A frame's hold is the longer of its freeze and its frozen voice clip, computed where holds are read (player, export timeline). For export the renderer places each clip on the output timeline and sends its bytes with the encode job; the main process writes them to the job's temp dir and adds them to the ffmpeg graph as extra inputs.

**Tech Stack:** Electron 44, React 18, Zustand, TypeScript, Vitest (jsdom), ffmpeg-static 6. Browser `MediaRecorder` (`audio/webm;codecs=opus`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-26-narration-design.md`

## Global Constraints

- No new npm dependencies. No network use. Audio never leaves the machine.
- A project or export with no voice clips must be byte-for-byte the same ffmpeg argv and the same frames as before this branch. Existing tests must pass unchanged, except where a signature this plan changes forces an edit.
- An IPC channel touches three files: `electron/main.ts`, `electron/preload.cjs` (live preload, CommonJS), `src/types/electron.d.ts`. `dist-electron/preload.cjs` is a TRACKED copy: apply the identical change to it. Never edit `electron/preload.ts`.
- Theme colours come from tokens (`src/theme/tokens.css`); Tailwind alpha modifiers on token colours emit no CSS, do not use them.
- Do not surface the hidden features (player tracker / YOLO, audience view, laser pointer).
- Exact values: min clip 0.3 s; max clip 120 s; duck gains Low 0.25, Off 0, Full 1 (default Low); export duck ramp 0.15 s; max 40 voice clips per exported clip; total voice bytes per encode job ≤ 64 MB; project version `'1.5'`; shortcut action `video.voice`, default key `n`; localStorage key `replay-studio-voice-duck`.
- Tests: run only the focused test files for your task (`npx vitest run <files> --no-file-parallelism`). Never run the whole suite (it takes 25 minutes on this share) and never run two vitest processes at once: check first with `ps -axo command | grep '^node .*vitest' | grep -v grep`. Then `npm run typecheck` and `npx eslint <changed files>`.
- Conventional commits; end each commit message with the `Co-Authored-By` line for your own model.
- No comments, docstrings or type annotations added to code you did not change.

## Review Focus

1. Recording ends without a clean stop (mic unplugged, permission revoked mid-recording, window blur while `N` is held): no stuck "recording" state, no clip without audio.
2. A voice clip whose start is outside the exported range, or runs past the export's end: left out / cut, never an ffmpeg error.
3. Source video with no audio track plus voice clips: MP4 has a sound track with the voice; in a reel every part has the same audio layout.
4. Undo after delete, and redo after undo: the clip returns with its audio and plays.
5. A project saved with voice, loaded in a fresh session: clips play and export; a corrupt or missing `data` entry is skipped with the rest of the project still loading.

---

### Task 1: Voice model, store, undo

**Files:**
- Create: `src/types/voice.ts`, `src/utils/voiceClips.ts`, `src/utils/voiceClips.test.ts`, `src/voice/voiceAudio.ts`, `src/stores/voiceStore.ts`, `src/stores/voiceStore.test.ts`
- Modify: `src/stores/drawingStore.ts` (undo extras become a list), `src/stores/speedStore.ts` (new register signature), `src/stores/speedUndo.test.ts` only if the signature forces it

**Interfaces — Produces:**

```ts
// src/types/voice.ts
export interface VoiceClip { id: string; startTime: number; duration: number; frozen: boolean; mime: string }
export type VoiceDuck = 'low' | 'off' | 'full'

// src/utils/voiceClips.ts
export const MIN_VOICE_SECONDS = 0.3
export const MAX_VOICE_SECONDS = 120
export const DUCK_GAIN: Record<VoiceDuck, number> // { low: 0.25, off: 0, full: 1 }
export function newVoiceClipId(): string
/** The frozen clip on `time`'s frame, if any. */
export function frozenVoiceAt(clips: VoiceClip[], time: number, fps: number): VoiceClip | undefined
/** Frozen clips as freeze entries for buildOutputTimeline: { startTime, freezeDuration: duration }. */
export function voiceFreezes(clips: VoiceClip[]): { startTime: number; freezeDuration: number }[]
/** Longer of the frame's freeze carrier (freezeDuration, 0 if none) and its frozen voice clip. */
export function frameHoldSeconds(annotations: { startTime: number; freezeDuration?: number; toolType?: string }[], clips: VoiceClip[], time: number, fps: number): number
/** Keeps well-formed entries only (finite startTime >= 0, MIN <= duration <= MAX + 1, boolean frozen, string id/mime); used on project load. */
export function sanitizeVoiceClips(value: unknown): VoiceClip[]

// src/voice/voiceAudio.ts  — bytes by clip id; entries are NOT removed when a clip is deleted (undo needs them)
export function setVoiceAudio(id: string, blob: Blob): void
export function getVoiceAudio(id: string): Blob | undefined
export function voiceAudioUrl(id: string): string | undefined   // cached URL.createObjectURL
export function clearVoiceAudio(): void                          // revokes URLs

// src/stores/voiceStore.ts
interface VoiceState {
  clips: VoiceClip[]            // sorted by startTime
  selectedId: string | null
  duck: VoiceDuck               // persisted in localStorage 'replay-studio-voice-duck'; unknown value -> 'low'
  add: (clip: VoiceClip, audio: Blob) => void   // frozen: replaces the frozen clip on the same frame (fps from videoStore). One undo step.
  remove: (id: string) => void                  // one undo step; no-op for unknown id
  select: (id: string | null) => void
  setDuck: (duck: VoiceDuck) => void            // not an undo step
  replaceAll: (clips: VoiceClip[]) => void      // no undo step; clears selection
}
export const useVoiceStore

// src/stores/drawingStore.ts
export function registerUndoExtra(key: string, extra: UndoExtra): void
```

- [ ] **Step 1: Undo extras as a keyed list.** `registerUndoExtra(key, extra)` stores extras in a Map; a snapshot's `extra` becomes `Record<string, unknown>` holding every registered extra's capture; restore calls each registered extra whose key is present in the snapshot (same guards as today: skipped when `pendingReplacement` is set). speedStore registers with key `'speed'`. Run `src/stores/speedUndo.test.ts`: must pass.
- [ ] **Step 2: Failing tests** in `voiceClips.test.ts`: `frozenVoiceAt` matches by frame index at 30 fps and ignores non-frozen clips; `voiceFreezes` returns only frozen clips; `frameHoldSeconds` returns `max(carrier, voice)` and 0 with neither; `sanitizeVoiceClips` drops entries with negative start, duration 0.1, missing id, non-array input → `[]`.
- [ ] **Step 3: Implement** `voiceClips.ts`, `voiceAudio.ts`.
- [ ] **Step 4: Failing tests** in `voiceStore.test.ts`: `add` then `useDrawingStore.getState().undo()` removes the clip and `redo()` brings it back, `getVoiceAudio(id)` still returns the blob; adding a second frozen clip on the same frame leaves one clip (the new one) and one undo restores the old one; `remove` then undo restores; an undo that only changes speed regions leaves voice clips unchanged and vice versa; `setDuck('off')` persists and an unknown stored value reads as `'low'`.
- [ ] **Step 5: Implement** `voiceStore.ts` (`useDrawingStore.getState().saveState()` before each change, as speedStore does; register undo extra `'voice'` restoring `clips` and dropping a selection that no longer exists).
- [ ] **Step 6:** focused tests, typecheck, eslint. Commit `feat: voice clip store with undo`.

### Task 2: Recording

**Files:**
- Create: `src/voice/recorder.ts`, `src/voice/recorder.test.ts`, `src/voice/voiceRecording.ts` (+ test)
- Modify: `src/stores/shortcutsStore.ts`, `src/hooks/useKeyboardShortcuts.ts`, `src/components/VideoPlayer/VideoControls.tsx`, `electron/main.ts`, `electron/preload.cjs`, `dist-electron/preload.cjs`, `src/types/electron.d.ts`, `package.json` (`build.mac.extendInfo`)

**Interfaces — Consumes:** Task 1's `useVoiceStore.add`, `newVoiceClipId`, `MIN_VOICE_SECONDS`, `MAX_VOICE_SECONDS`, `frozenVoiceAt`; `findFreezeCarrierAt` from `src/utils/freezeFrame.ts`; videoStore (`videoElement`, `fps`, `reverseRate`, `slowRecording`, the pause-at-frame action whose doc says it "returns the exact frame start").

**Produces:**

```ts
// src/voice/recorder.ts — thin wrapper over getUserMedia + MediaRecorder, injectable for tests
export interface VoiceRecorder { stop(): Promise<{ blob: Blob; mime: string } | null>; cancel(): void }
export async function startVoiceRecorder(deps?: { getUserMedia?: typeof navigator.mediaDevices.getUserMedia; createRecorder?: (s: MediaStream) => MediaRecorder }): Promise<VoiceRecorder>  // rejects when the mic is unavailable; stop() releases the stream's tracks

// src/voice/voiceRecording.ts — the app-level action
export const useVoiceRecording  // zustand: { recording: { startedAt: number; startTime: number; frozen: boolean } | null }
export async function beginVoiceRecording(): Promise<void>
export async function endVoiceRecording(): Promise<void>
export function cancelVoiceRecording(): void

// IPC
window.electronAPI.requestMicrophone(): Promise<boolean>   // channel 'voice:requestMicrophone'
```

- [ ] **Step 1: IPC `voice:requestMicrophone`.** On macOS returns `systemPreferences.askForMediaAccess('microphone')`; on other platforms `true`. Add `NSMicrophoneUsageDescription: "Replay Studio records your voice when you add narration to a clip."` under `build.mac.extendInfo` in `package.json`.
- [ ] **Step 2: Failing tests** for `voiceRecording.ts` with an injected fake recorder and fake clock: begin while paused → `recording.frozen === true` and `startTime` equals the frame's freeze carrier `startTime` when one exists on that frame, else the exact frame start; begin while playing → `frozen === false`, `startTime` = `videoElement.currentTime` at begin; end after 0.2 s adds nothing and shows the "too short" toast; end after 2 s adds one clip with `duration` 2 (rounded to 0.01); begin is refused (no recorder started) when `reverseRate > 0`, when `slowRecording` is set, and when an export is running; reaching 120 s ends the recording and saves a 120 s clip; a recorder whose `stop()` resolves null adds nothing and clears `recording`; a rejected `startVoiceRecorder` shows "Microphone not available" and leaves `recording` null; calling begin twice starts one recorder.
- [ ] **Step 3: Implement** `recorder.ts` and `voiceRecording.ts`. Duration is wall-clock time between recorder start and stop. A frozen recording ends when the video starts playing or seeks; a playing recording ends when the video pauses or ends (subscribe to the video element / videoStore while recording; unsubscribe on end). `cancelVoiceRecording` on video unload.
- [ ] **Step 4: Shortcut + button.** Add action `video.voice` ("Voice: hold to record", Video Playback, key `n`) following `video.slow` exactly (keydown non-repeat → begin, keyup of that key → end, window blur → end). Add a mic button next to `SlowButton` in `VideoControls.tsx`: click toggles begin/end; shows a recording state (accent colour, elapsed seconds) while `recording` is set; `title` names the key. Check `n` is not bound by another action (`shortcutsStore.test.ts` has a uniqueness test; extend it if it lists actions).
- [ ] **Step 5:** focused tests, typecheck, eslint. Commit `feat: record voice clips with N or the mic button`.

### Task 3: Replay in the app

**Files:**
- Create: `src/voice/voicePlayback.ts` (+ test)
- Modify: `src/components/VideoPlayer/VideoPlayer.tsx`, `src/utils/holdPreview.ts` (+ its test), `src/stores/videoStore.ts` only if `pendingPreview` needs setting from the recorder

**Interfaces — Consumes:** `useVoiceStore`, `voiceAudioUrl`, `frozenVoiceAt`, `frameHoldSeconds`, `DUCK_GAIN`.

**Produces:**

```ts
// src/voice/voicePlayback.ts
/** Every frame that holds: one entry per freeze carrier with freezeDuration > 0 and per frozen voice clip, merged per frame (seconds = the longer; time = the carrier's startTime when there is one). id is stable per frame. */
export function effectiveHolds(annotations: Annotation[], clips: VoiceClip[], fps: number): { id: string; time: number; seconds: number; voiceId?: string }[]
/** Plays a clip's audio from the start; returns a stop function. One clip at a time: starting another stops the first. */
export function playVoice(id: string): () => void
export function stopVoice(): void
/** The playing (non-frozen) clip whose start lies in (prevTime, curTime]. */
export function voiceCrossed(clips: VoiceClip[], prevTime: number, curTime: number): VoiceClip | undefined
```

- [ ] **Step 1: Failing tests:** `effectiveHolds` — carrier 1 s + voice 3 s on one frame → one hold of 3 s at the carrier's time with `voiceId`; voice only → hold at the clip's `startTime`; carrier only → unchanged from today; carrier with `freezeDuration` 0 plus voice 2 s → 2 s. `voiceCrossed` — start exactly at `curTime` counts, at `prevTime` does not, frozen clips never. `previewHoldFor` returns a hold for a frame that has only a frozen voice clip.
- [ ] **Step 2: Player holds.** In `VideoPlayer.tsx` the time-update loop iterates `effectiveHolds(...)` instead of annotations with `freezeDuration`; `startHold` takes `{ time, seconds, voiceId }`, starts `playVoice(voiceId)` when present, and the hold timer uses `seconds`. `resetFreezes` (seek / user pause) calls `stopVoice()`. With no voice clips the behaviour and timings are exactly as before.
- [ ] **Step 3: Playing clips.** In the same loop, when playing forward (not reverse/shuttle) and `voiceCrossed` returns a clip: `playVoice(clip.id)`, set the video element's volume to `storeVolume * DUCK_GAIN[duck]` and restore it when the clip's audio ends, on pause, on seek, and on unmount. The stored `volume` in videoStore is never changed by ducking; a user volume change during a duck applies as `newVolume * gain`.
- [ ] **Step 4: Preview after recording.** After a frozen clip is saved, the first Play previews the frame's hold (reuse `pendingPreview` the way drawing does).
- [ ] **Step 5:** focused tests, typecheck, eslint. Commit `feat: voice plays back on freezes and over moving video`.

### Task 4: Voice lane

**Files:**
- Create: `src/components/Timeline/VoiceLane.tsx`
- Modify: `src/components/Timeline/AnnotationTimeline.tsx`, `src/hooks/useKeyboardShortcuts.ts` (Delete / Backspace), `src/utils/speedLane.ts` only if a helper is shared

**Interfaces — Consumes:** `useVoiceStore` (`clips`, `selectedId`, `select`, `remove`, `duck`, `setDuck`), `playVoice` / `stopVoice`.

- [ ] **Step 1:** `VoiceLane` renders only when `clips.length > 0`, below the Speed lane, same lane header style and height as `SpeedLane.tsx`. Each clip is a bar starting at `startTime`: a playing clip is `duration` seconds wide (source seconds, min 10 px); a frozen clip is a fixed 14 px marker with a mic glyph. Label: duration as `2.4s`; `title`: "Voice, 2.4s, on a frozen frame" / "Voice, 2.4s, over the video". The lane counts toward the timeline's automatic height the same way the Speed lane does (`autoLaneHeight`'s `laneTopPx`).
- [ ] **Step 2:** Click a bar: selects it (and clears the speed-region and annotation selection the way the Speed lane clears the others), and plays it once (`playVoice`); clicking the lane background clears the selection and stops it. A selected bar shows a Delete button (same as the Speed lane's). Delete / Backspace removes the selected voice clip, with the same priority rules the Speed lane uses (not while typing in a field, not during callout/text editing).
- [ ] **Step 3:** In the lane header a small select "Game sound under voice": Low / Off / Full bound to `duck` (blur on change, like the theme picker).
- [ ] **Step 4: Tests** (component test with jsdom, mock `playVoice`): lane absent with no clips; two clips render two bars with the right titles; click selects and calls `playVoice`; Delete button calls `remove`; changing the select calls `setDuck`.
- [ ] **Step 5:** focused tests, typecheck, eslint. Commit `feat: Voice lane on the timeline`.

### Task 5: Export mix

**Files:**
- Create: `src/export/voiceMix.ts` (+ test), `electron/voiceMix.ts` (+ test, including a real-ffmpeg test)
- Modify: `src/types/clip.ts`, `src/export/clipRenderer.ts`, `src/export/reelRenderer.ts`, the dialogs/callers that pass `speedRegions` into them (pass voice clips + duck the same way), `electron/clipExport.ts`, `electron/main.ts`, `electron/reelExport.ts` only if the part format needs it

**Interfaces — Produces:**

```ts
// src/types/clip.ts
export interface VoiceTrack { data: Uint8Array; outStart: number; duration: number }
export interface VoiceMix { tracks: VoiceTrack[]; duckWindows: { start: number; end: number }[]; duckGain: number }
// ClipEncodeStartOptions gains:  voice?: VoiceMix;  forceAudio?: boolean

// src/export/voiceMix.ts
export const MAX_VOICE_CLIPS_PER_CLIP = 40
export interface VoicePlacement { id: string; outStart: number; duration: number; duck: boolean }
/** Places clips whose startTime is in [clip.start, clip.end) on the output timeline. Frozen: the output start of the hold segment whose srcTime is on the clip's frame. Playing: output time of its source time (through play segments' speed). duration is cut at the output's end; a clip left with < 0.05 s is dropped. duck is true for playing clips. */
export function placeVoice(segments: OutputSegment[], clip: Pick<Clip, 'start' | 'end'>, voiceClips: VoiceClip[], fps: number): VoicePlacement[]
export function voiceLimitError(clip: Pick<Clip, 'start' | 'end'>, voiceClips: VoiceClip[]): string | null   // `Too many voice clips in this clip (max 40)`
export async function buildVoiceMix(placements: VoicePlacement[], duck: VoiceDuck, getAudio?: (id: string) => Blob | undefined): Promise<VoiceMix | undefined>  // undefined when no placement has audio

// electron/voiceMix.ts — pure
export interface VoiceGraphInput { tracks: { inputIndex: number; outStart: number; duration: number }[]; duckWindows: { start: number; end: number }[]; duckGain: number; totalDuration: number }
/** Filter parts that turn `[baseLabel]` plus the voice inputs into `[outLabel]`. */
export function voiceFilterParts(baseLabel: string, outLabel: string, input: VoiceGraphInput): string[]
/** volume expression: 1 outside the windows, duckGain inside, linear over 0.15 s at each edge. */
export function duckVolumeExpr(windows: { start: number; end: number }[], duckGain: number): string
export function validateVoiceMix(voice: unknown): string | null   // shape, finite non-negative numbers, <= 40 tracks, total bytes <= 64 MB
```

- [ ] **Step 1: Timeline holds.** `renderClip` and the reel renderer build the output timeline from `[...annotations, ...voiceFreezes(voiceClips)]`, so a frozen clip lengthens (or creates) its frame's hold. Everything downstream that reads holds from `segments` (reveal, overlays) is unchanged. Test: a frozen 3 s clip on a frame with a 1 s freeze yields one 3 s hold; with no voice clips `segments` is deep-equal to today's.
- [ ] **Step 2: Failing tests** for `placeVoice`: frozen clip on a hold → `outStart` = sum of earlier segments' output durations; playing clip at source 4 s in a clip starting at 2 s with a 2 s hold at 3 s → `outStart` 4; inside a 0.5× segment → source offset doubled; clip starting before `clip.start` or at `clip.end` → left out; duration cut at the output end; 41 clips → `voiceLimitError`.
- [ ] **Step 3: Implement** `src/export/voiceMix.ts`; wire `renderClip` / reel renderer: options gain `voiceClips?: VoiceClip[]` and `voiceDuck?: VoiceDuck`; pass `voice` on `clipEncodeStart` only when `buildVoiceMix` returns one and the format is MP4. Callers (export dialogs) pass `useVoiceStore.getState().clips` and `.duck`.
- [ ] **Step 4: Reel layout.** When any clip in a reel has a voice placement, every part of that reel (title cards included) is started with `forceAudio: true`.
- [ ] **Step 5: Main process.** `validateVoiceMix` in the `clipEncodeStart` handler (reject with a clear error). `startClipEncodeJob` writes each track to `<tmpDir>/voice-<n>.webm` (names generated by main only) and stores them on the job. `buildClipEncodeFilterGraph` input gains `voice?: { paths: string[]; tracks: { outStart: number; duration: number }[]; duckWindows; duckGain }` and `forceAudio?: boolean`:
  - audio is included when `!isGif && (hasAudio || forceAudio || voice)`; when the source has no audio every segment's audio is `anullsrc` of that segment's output duration;
  - with `voice`: the concat output becomes `[abase]`; voice files are appended as inputs after the overlay input; `voiceFilterParts('abase', 'aout', ...)` applies the duck volume to the base, and for each track `aresample` to the job's sample rate, stereo `aformat`, `atrim=duration`, `adelay` by `outStart` (all channels), then `amix=inputs=N:normalize=0:duration=first` so the output keeps the base length;
  - with neither `voice` nor `forceAudio` the argv is identical to today's (existing argv tests must pass untouched).
  A reel part reserved with voice or `forceAudio` reports `hasAudio: true` in its part format so the join's layout check passes.
- [ ] **Step 6: Argv tests** in `electron/clipExport.test.ts` / `electron/voiceMix.test.ts`: voice adds `-i` per track after the overlay input, `amix` with `normalize=0`, `adelay` in ms; no-audio source + voice maps `[aout]`; `duckVolumeExpr` evaluates (by a small JS evaluator in the test or by sampling known points) to 1 before a window, `duckGain` in its middle, halfway at 0.075 s inside the edge.
- [ ] **Step 7: Real-ffmpeg test** (follow the existing real-ffmpeg guard test added in `f60ebb7`; skip when the binary is missing): generate a 6 s test video with a 440 Hz tone, a 1 s 1000 Hz "voice" WebM/Opus file; build the argv through `buildClipEncodeFilterGraph` with (a) a playing voice at output 2 s, duck 0.25, (b) a frozen voice on a 2 s hold; decode the output audio to PCM and assert: 1000 Hz energy present only in the expected second (Goertzel or band energy on 0.25 s windows, ±0.1 s), 440 Hz level inside the duck window about a quarter of outside (±30%), output duration equals `frameCount / fps` within one frame, and case (c) no-audio source + voice produces an audio stream.
- [ ] **Step 8:** focused tests, typecheck, eslint. Commit `feat: voice mixed into MP4 exports`.

### Task 6: Project file, new video, docs

**Files:**
- Modify: `src/utils/projectSerializer.ts` (+ test), `src/App.tsx` (save, load, new video), `README.md`, `KEYBOARD_SHORTCUTS.md`, `QUICK_START.md`, `ARCHITECTURE.md` (one paragraph), `CLAUDE.md` (stores list + one gotcha line)

**Interfaces — Produces:**

```ts
// ProjectData gains (version '1.5'):
voiceClips?: SerializedVoiceClip[]      // VoiceClip & { data: string }  (base64 of the audio bytes)
// serializeProject gains a trailing optional parameter: voice?: SerializedVoiceClip[]
export async function serializeVoiceClips(clips: VoiceClip[], getAudio?: (id: string) => Blob | undefined): Promise<SerializedVoiceClip[]>   // clips without audio are left out
export function restoreVoiceClips(entries: unknown): { clips: VoiceClip[]; audio: Map<string, Blob> }   // sanitizeVoiceClips + base64 decode; an entry whose data is missing or not base64 is skipped
// hasProjectContent counts gain: voiceClips: number
```

- [ ] **Step 1: Failing tests:** serialize → JSON → import → `restoreVoiceClips` round-trips two clips with identical bytes; a 1.4 file (no `voiceClips`) restores to none; an entry with `data: 42` is skipped and the other kept; `version` is `'1.5'`; `hasProjectContent` is true with only a voice clip.
- [ ] **Step 2: Implement**; base64 in chunks (no `String.fromCharCode(...bigArray)` spread on large buffers).
- [ ] **Step 3: App wiring.** Save: pass `await serializeVoiceClips(...)`. Load: `clearVoiceAudio()`, register each restored blob with `setVoiceAudio`, `useVoiceStore.getState().replaceAll(clips)`, where speed regions are restored today. New video: `replaceAll([])`, `clearVoiceAudio()`, `cancelVoiceRecording()` beside the existing `useSpeedStore.getState().replaceAll([])` / `clearHistory()`. The unsaved-changes / "has content" checks include voice clips wherever they include speed regions.
- [ ] **Step 4: Docs.** README feature section "Narration", shortcut `N` in KEYBOARD_SHORTCUTS.md, a short how-to in QUICK_START.md, CLAUDE.md: add `voiceStore` to the stores list and the line "Voice audio lives in `src/voice/voiceAudio.ts` keyed by clip id and is not deleted with the clip (undo needs it); it is cleared on new video / project load."
- [ ] **Step 5:** focused tests, typecheck, eslint. Commit `feat: voice clips saved in the project file (version 1.5)`.
