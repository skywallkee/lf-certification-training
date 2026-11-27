# 0023. Rich lessons: diagrams as data, and narrated lesson videos built from the lesson

Date: 2026-11-26
Status: Proposed (the format waits for the user's review of the template lesson)

(Numbered 0023 because 0022 is reserved for the community discussions work made at the same time.)

## Context

Before real content is written, the user asked for a lesson format that goes beyond the documentation: what a
thing is, how and why it works, how to use it, with diagrams and illustrations, worked examples and tricks, and an
animated video per lesson that tells the same story as the text, with illustrations and narration. Everything
runs locally on Docker for now, the platform is free for learners, and the cloud budget is $100 a month per cloud,
so the videos cannot depend on a paid service or on expensive hosting.

Options for the video:

1. **Rendered video files** (Remotion or Motion Canvas renders MP4s from code, with recorded or synthesised
   narration). Real files that play anywhere, but every text change means a re-render, files cost storage and
   bandwidth, they drift from the text, and Remotion needs a company licence above three employees.
2. **Paid text to speech** (cloud voices). Good voices, but a running cost and an outside service.
3. **A player that animates the lesson's own data, with local text to speech.** Nothing to render or host, always
   in step with the text, and editable in the app; the cost is that "the video" only exists inside the app.

## Decision

- **Option 3.** A lesson may have a `video` script in its front matter: scenes, each with narration and one visual
  (title card, points, one of the lesson's diagrams, code with highlighted lines, or a typed terminal session).
  Each narration sentence moves the visual one step, so text and animation stay in sync with no timing data. The
  player (`components/lesson-video.tsx`) has play and pause, a timeline with scene marks, a scene list, speed,
  captions, a transcript, full screen and keyboard controls.
- **Narration is local and free:** a `narrator` service (platform/narrator) runs Kokoro, an 82M-parameter text to
  speech model with Apache-2.0 weights, through kokoro-onnx on the CPU. It synthesises a sentence about three times
  faster than real time on four cores. The web app asks for one sentence at a time and caches the MP3 by
  `sha256(voice, speed, text)` in a volume, so a sentence is made once, an edit invalidates only the sentences it
  changes, and browsers cache each file for good. Published lessons are narrated in the background after start-up
  and after every save. A small pronunciation list (kubectl, etcd, ClusterIP, ...) changes only the audio.
- **The player degrades instead of failing:** without the narrator (or if a file fails) it reads the narration with
  the browser's own voice (Web Speech API), and with no voice at all it goes on with captions on a timer.
- **Diagrams are data** in the front matter (`diagrams`), placed in the body with `<Diagram id>` and reused by video
  scenes. Nodes sit on a grid with an icon, a label and a second line; edges and groups are drawn as SVG in the
  theme's colours, with a text version for screen readers. Data instead of an image or a Mermaid block means the
  video can reveal and highlight parts step by step, the validator can check references, and no client-side
  diagram library is needed.
- **New body components:** `<KeyIdea>`, `<DeepDive>` (folded "under the hood" details), `<Example>` and `<Trick>`,
  allowed by the editor's MDX safety check like `<Callout>` and `<Flow>`. content/README.md documents the lesson
  template. The first sample, `lessons/sample/cka/services.mdx`, was removed with the other sample lessons once the
  real CKA lessons (`lessons/cka/NN-slug.mdx`) used the format.
- The lesson table gets `diagrams` and `video` columns (curriculum migration 0007). The admin editor edits diagrams
  as YAML and the video scene by scene, can **draft a video from the lesson's sections**, and its Preview tab plays
  the video with unsaved narration (admin-only narration URLs that carry the text).

## Consequences

- Videos cost nothing to host and never go stale; a text fix is a one-sentence re-synthesis.
- There is no MP4 to download or post elsewhere. If that is wanted later, a script can record the player with
  Playwright (it already plays headless) and mux the narration with ffmpeg.
- The narrator image is about 650 MB and uses about 350 MB of memory; the stack works without it.
- In the cloud, the narrator does not need to stay up: narration can be made once at deploy time and the MP3s
  served from storage, since they are content-addressed.
- Illustrations beyond diagrams (drawings, photos) are not supported yet; Markdown images from https URLs work.
