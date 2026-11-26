# Narration, release 1: talk on a frame — design

Approved by Mark on 2026-11-26 ("Both" modes wanted; this is the first of two releases). Ships as 1.10.0. Release 2 (record one full take while reviewing) is designed separately afterwards.

## Intent

A coach explains a play in their own voice. They record short voice clips while reviewing, and the voice ends up in the exported MP4 in the right place, so a clip can be sent to a player with the explanation on it.

## Goals

1. **Record by holding a key.** Hold `N`, or click the mic button beside Freeze and Slow (click to start, click to stop). Release to save. A tap under 0.3 s records nothing. A clip stops by itself at 120 s.
2. **On a paused frame, the voice freezes the frame.** The clip belongs to that frame. On replay and in exports the video holds on the frame for as long as the voice lasts, or as long as the frame's existing freeze (from drawings, Freeze or the inspector), whichever is longer. One voice clip per frame: recording again on the same frame replaces it.
3. **While the video plays, the voice goes over the moving video.** The clip starts at the moment recording began. The game sound drops under the voice. A setting chooses how far: Low (25%, default), Off, or Full (no change).
4. **A Voice lane on the timeline** (it appears once there is a clip). Each clip is a bar; click to select and hear it, Delete / Backspace or a Delete button removes it.
5. **Undo and redo cover voice clips** in the same history as drawings and slow-motion regions.
6. **MP4 exports contain the voice**, mixed with the game sound, for single exports, clip exports and reels. GIF stays silent.
7. **The project file keeps the voice.** Audio is stored inside the project file (project version 1.5). Projects from 1.4 and earlier open unchanged.
8. **Microphone permission** is asked for on first use. The Mac build declares microphone use.

## Non-goals

- Recording one continuous take across a whole review (release 2).
- Moving, trimming or re-timing a voice clip after recording. Delete and record again.
- Editing sound: noise removal, level controls, choosing an input device (the system default is used).
- Voice in GIF exports, or in the saved "editable copy" beyond what the project file already carries.
- A ramp on the live (in-app) game-sound drop. In the app it steps; in exports it ramps.

## Anti-goals

- A project or export with no voice clips changing in any way: same frames, same audio graph, same file layout.
- Voice audio leaving the machine. Recording, storage and mixing are all local.
- A lost recording: a clip that was saved must survive undo/redo and save/load with its audio.

## Approaches

- **Where a frozen clip's hold comes from.** (a) Voice clips are their own list, and the frame's hold is computed as the longer of the freeze and the voice wherever holds are read (chosen). (b) Write the voice length into the frame's freeze marker. Rejected: automatic freezes are recalculated from the drawings on every edit and would shrink back; deleting the voice could not restore the earlier value.
- **Audio format.** The browser's own recorder (WebM/Opus) with no new dependency (chosen), over WAV capture through an audio worklet (large files, more code). ffmpeg reads WebM/Opus directly.
- **Project storage.** Audio embedded in the project file as base64 (chosen: one file to move or send, about 5 KB per second of speech), over sidecar files next to the project (can be separated and lost).
- **Mixing.** Each voice clip is an extra ffmpeg input, delayed to its place on the output timeline and mixed over the existing audio (chosen), over pre-mixing one voice track in the renderer (needs decoding and resampling in the app, and a second code path to test).

## Behaviour details

- **Where a clip lands.** Paused: the current frame's exact start, or the start time of the freeze already on that frame if there is one, so the two merge into one hold. Playing: the source time when recording began. Recording that starts while paused stays a frozen clip even if nothing else happens; pressing Play or seeking while recording ends the recording at that point. Recording that starts while playing ends if the video pauses or reaches the end.
- **Recording is refused** during reverse or shuttle playback, while a slow-motion recording is running, and during an export.
- **Replay in the app.** A frame with a frozen voice clip holds like any freeze and plays the voice from its start; pausing or seeking stops it. The first Play after recording on a paused frame previews that hold, as it does after drawing. A playing clip starts when the playhead crosses its start going forward at normal direction; the game sound drops for its length and comes back after. Starting playback in the middle of a clip does not play it.
- **Slow-motion regions.** A voice clip always plays at normal speed. Over a slow region the voice simply covers less of the action.
- **Exports.** A clip takes part in an export when its start lies inside the exported range. A voice that runs past the end of the export is cut at the end. In a reel, if any exported clip has voice and the source video has no sound, every part gets a silent sound track so the parts still join.
- **Game-sound drop in exports** ramps over 0.15 s at each end of a playing clip. Frozen clips need no drop: a held frame is already silent.
- **Limits.** 120 s per clip. At most 40 voice clips in one exported clip; more is an export error naming the limit.
- **New video** clears voice clips with the rest of the undo history. Loading a project replaces them.
- **Microphone refused or missing:** a message says the microphone is not available and nothing is recorded.

## Left to the builder

File layout, component structure, the exact look of the mic button, lane and bars (follow the Speed lane), toast wording, test structure.

## Testing

Focused tests per task while building. The mix is verified against real ffmpeg: voice present at the right output time, game sound lower inside the window, a held frame carrying the voice. One full suite run and one in-app plus MP4 pass before release, with Chromium's fake microphone.
