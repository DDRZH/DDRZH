# Firebase Realtime Voice Migration Design

**Goal**

Migrate the current Ren clone voice path in `DDRZH` from file-based post-generation MP3 playback to real-time streamed voice on Firebase Hosting + Cloud Functions, reusing the proven architecture from `Ren-Zihans-Clone` while preserving the current text chat behavior and safe fallback paths.

**Current Problem**

The current Firebase deployment generates MP3 files inside the function runtime and returns relative URLs like `audio/<filename>.mp3`. This works locally because the local Node server exposes an `audio/` static directory. It fails on Firebase because Cloud Functions temporary disk is not exposed through Firebase Hosting, and the current hosting config only rewrites `/api/ren-clone` to the function.

As a result, the text reply completes, but the browser receives an audio URL that does not resolve to a real public resource.

**Target Outcome**

After migration:

- The browser starts receiving text tokens before the answer is complete.
- The browser starts receiving audio chunks before the full answer is complete.
- No MP3 files are written or served for the realtime path.
- Voice playback works on Firebase without requiring Firebase Storage.
- Text continues to work when voice is disabled or the voice provider fails.

## Recommended Architecture

Use a new realtime HTTP endpoint on Cloud Functions v2 that keeps a single Server-Sent Events response open while it coordinates two streams:

1. LLM token stream
2. ElevenLabs WebSocket text-to-speech stream

The server forwards:

- token chunks to the browser as SSE `token` events
- audio chunks from ElevenLabs to the browser as SSE `audio` events
- final completion as SSE `done`

The browser renders text incrementally and decodes PCM audio chunks with the Web Audio API through an `AudioQueue` helper.

This is the same pattern already validated in `Ren-Zihans-Clone`, adapted to the current `DDRZH` Firebase layout.

## Scope

In scope:

- Add a new realtime Ren clone API path
- Add streaming server modules under `functions-renclone/`
- Add browser-side incremental text rendering and PCM audio playback
- Keep existing password, origin, and rate-limit behavior aligned with current Ren clone behavior
- Keep the old serial endpoint temporarily for fallback

Out of scope:

- Migrating to Cloud Run
- Adding Firebase Storage for audio files
- Redesigning the chat UI
- Changing persona data or prompt content beyond what streaming requires

## Two Viable Approaches

### Approach A: Full Realtime Streaming in Cloud Functions v2

Add a new `renCloneLive` HTTP function that:

- opens an SSE response
- streams LLM tokens
- forwards phrase chunks into ElevenLabs WebSocket `stream-input`
- emits `audio` SSE events carrying base64 PCM chunks

Pros:

- Matches the target product behavior
- Removes file storage dependency entirely
- Reuses the proven design from the sibling project
- Keeps Firebase deployment shape mostly unchanged

Cons:

- Relies on long-lived SSE stability through Firebase Hosting rewrites
- Requires incremental client playback logic

### Approach B: Move Realtime Voice to Cloud Run

Keep the frontend on Firebase Hosting, but move only the realtime API to Cloud Run.

Pros:

- Better long-lived streaming control
- More operational flexibility

Cons:

- More deployment complexity
- New service boundary, CORS, env management, and routing work
- Not necessary unless Functions v2 proves unstable in practice

### Recommendation

Start with Approach A. The implementation should isolate the realtime transport into small modules so that the same logic can later move to Cloud Run with minimal changes if Firebase Hosting -> Functions streaming proves unreliable in production.

## Existing Files and Their Role

- [ai-clone.js](/Users/dd/projects/DDRZH/ai-clone.js): current browser chat logic using SSE for status and final result, but still expecting a final `audioUrl`
- [functions-renclone/index.js](/Users/dd/projects/DDRZH/functions-renclone/index.js): Firebase Functions entrypoint for the deployed Ren clone
- [functions-renclone/ren-clone-handler.js](/Users/dd/projects/DDRZH/functions-renclone/ren-clone-handler.js): current serial handler that generates full text first, then writes MP3 and returns `audio/<filename>`
- [firebase.json](/Users/dd/projects/DDRZH/firebase.json): current Hosting rewrite for `/api/ren-clone`

## Proposed Server Design

### New Endpoint

Add a new API route:

- `POST /api/ren-clone-live`

Keep the existing route during migration:

- `POST /api/ren-clone`

The new route should be exposed through Firebase Hosting rewrites to a new function export, for example `renCloneLive`.

### New Modules

Add these modules under `functions-renclone/streaming/`:

- `LiveSession.js`
- `LlmStreamer.js`
- `ElevenLabsWsStreamer.js`

Their responsibilities:

- `LlmStreamer.js`
  - Wrap OpenAI or DeepSeek streaming APIs
  - Yield text tokens incrementally
  - Preserve current provider selection behavior where practical

- `ElevenLabsWsStreamer.js`
  - Connect to ElevenLabs WebSocket `stream-input`
  - Send text chunks as they become speech-ready
  - Emit audio chunks as base64 PCM
  - Surface provider errors cleanly

- `LiveSession.js`
  - Own the SSE response lifecycle
  - Read tokens from `LlmStreamer`
  - Buffer short text fragments into speech-friendly chunks
  - Forward chunks to ElevenLabs
  - Emit `status`, `token`, `audio`, `audioError`, `textDone`, `done`, `error`
  - Close all upstream streams when the client disconnects

### Event Contract

The new SSE contract should be:

- `status`: `{ stage: "thinking" | "speaking", message?: string }`
- `token`: `{ token: string }`
- `audio`: `{ chunk: "<base64 pcm_s16le_24000_mono>" }`
- `audioError`: `{ message: string }`
- `textDone`: `{ answer: string }`
- `done`: `{ answer: string }`
- `error`: `{ error: string }`

This event contract should match the sibling project closely to reduce migration risk.

### Phrase Buffering Rules

Do not send every token directly to ElevenLabs. Buffer and flush on natural boundaries. Reuse the existing sibling-project rules as the baseline:

- flush at `.`, `!`, `?`
- flush at `,` when the fragment is long enough
- flush on whitespace or punctuation when the buffer is long enough
- force flush when the buffer reaches a hard upper bound

This avoids robotic phrasing and reduces tiny-audio-chunk overhead.

### Voice Failure Behavior

If ElevenLabs is unavailable or rejects credentials:

- continue streaming text
- emit `audioError`
- still send `done` after text finishes

Voice is an enhancement, not a dependency for text delivery.

### Client Disconnect Handling

When the browser closes the request:

- stop reading more LLM tokens
- close the ElevenLabs WebSocket
- end the function response

This avoids leaked long-lived work inside the function instance.

## Proposed Client Design

### Frontend Behavior

Update [ai-clone.js](/Users/dd/projects/DDRZH/ai-clone.js) to use the new realtime endpoint for voice-enabled conversations.

Required behavior:

- start a fetch to `/api/ren-clone-live`
- parse SSE chunks incrementally
- append `token` data into a text stream controller
- create an `AudioQueue` when the first `audio` event arrives
- enqueue PCM chunks into the audio queue
- display `audioError` without interrupting text
- stop previous active text/audio streams before starting a new message

### Audio Queue

Add a browser helper file, for example:

- `audio-queue.js`

Responsibilities:

- decode base64 PCM
- convert `Int16` little-endian mono 24kHz samples into float buffers
- schedule gapless playback in `AudioContext`
- stop scheduled playback when the user sends a new message or clears chat

### Text Rendering

Preserve the current UI style, but render assistant text progressively from `token` events instead of waiting for a final answer payload.

The final `done` event remains the authoritative completion signal for:

- removing pending UI state
- storing the final assistant reply in history
- clearing transient status elements

## Firebase Deployment Changes

### Functions

Add a new function export in [functions-renclone/index.js](/Users/dd/projects/DDRZH/functions-renclone/index.js):

- `exports.renCloneLive = onRequest(...)`

It should use the same secrets as `renClone`:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL`
- `OPENAI_API_MODE`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`
- `ELEVENLABS_MODEL_ID`
- `VOICE_ENABLED`

### Hosting Rewrite

Update [firebase.json](/Users/dd/projects/DDRZH/firebase.json) with a second rewrite:

- `/api/ren-clone-live` -> `renCloneLive`

Keep the old rewrite intact during rollout.

## Compatibility Rules

### Keep Old Endpoint Temporarily

Do not delete the serial `/api/ren-clone` path during the first migration pass.

Reasons:

- fast rollback
- easier A/B verification
- simpler debugging if production streaming fails

### Preserve Existing Access Controls

The new live handler should keep:

- password gate semantics
- current allowed origins
- current body normalization and history sanitization
- current rate-limit logic, adjusted only if the live endpoint needs a separate key namespace

### Voice Toggle Semantics

Current UI semantics should remain:

- if global voice is disabled, the live endpoint can still stream text only
- if the per-request toggle is off, the endpoint should skip ElevenLabs and stream text only

## Required Code Adaptations from the Sibling Project

The migration should reuse architecture, not blindly copy files.

Necessary adaptations:

1. Convert ESM-style sibling modules to the module format already used by `functions-renclone`
2. Preserve current `DDRZH` request validation, password check, and origin allowlist
3. Preserve current persona/prompt assembly in `functions-renclone/ren-clone-handler.js`
4. Remove dependencies on sibling-project-specific paths and route names
5. Ensure browser script uses the current `DDRZH` DOM structure and voice toggle state

## Testing Strategy

### Unit-Level

Add tests for:

- `ElevenLabsWsStreamer` message handling
- `LiveSession` event emission
- phrase flush behavior
- text-only fallback when voice is disabled or unavailable

### Manual Local Verification

Verify locally:

1. Send a message with voice enabled
2. Confirm `token` events arrive before the final answer
3. Confirm `audio` events arrive before the final answer completes
4. Confirm audible playback starts before full text completion
5. Disable ElevenLabs credentials and confirm text still completes with a voice error
6. Send a second message while audio is still playing and confirm the first audio stops

### Firebase Verification

After deploy:

1. Open the deployed page
2. Send a voice-enabled message
3. Confirm Network shows a long-lived request to `/api/ren-clone-live`
4. Confirm SSE frames include `token`, `audio`, and `done`
5. Confirm audio plays without any MP3 URL requests
6. Confirm the old `/api/ren-clone` route still works if manually exercised

## Risks and Mitigations

### Risk: Firebase Hosting rewrite buffering or unstable SSE behavior

Mitigation:

- emit `status` immediately after connection
- keep messages flowing throughout generation
- isolate streaming modules so the endpoint can move to Cloud Run later without redoing frontend protocol

### Risk: OpenAI/DeepSeek streaming path differs from current full-response path

Mitigation:

- build `LlmStreamer` behind a narrow interface
- support provider-specific implementations internally
- keep non-streaming logic untouched in the old endpoint during rollout

### Risk: Text rewriting step blocks realtime output

The current serial code rewrites CJK output back into English after completion. That pattern is incompatible with first-token streaming.

Mitigation:

- remove post-hoc rewrite from the live path
- instead strengthen instructions so the live path must produce English directly
- keep the old serial path unchanged until live behavior is validated

### Risk: Browser autoplay restrictions

Mitigation:

- start audio only in direct response to a user form submit
- create or resume `AudioContext` only after the user has already interacted

## Rollout Plan

Phase 1:

- Add backend live endpoint and streaming modules
- Add frontend live consumer and `AudioQueue`
- Keep old endpoint intact

Phase 2:

- Switch the main UI to the live endpoint
- Validate locally and on Firebase

Phase 3:

- Keep serial endpoint as hidden fallback for a short period
- Remove file-based audio generation only after live path is stable

## Decision

Proceed with a compatibility-first migration to a new realtime endpoint on Firebase Cloud Functions v2, using SSE for browser delivery and ElevenLabs WebSocket streaming for voice generation. Keep the old serial MP3 endpoint temporarily for rollback, but treat the realtime path as the intended production architecture.
