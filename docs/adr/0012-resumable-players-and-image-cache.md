# 0012. Players resume from the server, and k3s imports cached images at boot

Date: 2026-11-26
Status: Accepted

## Context

After the labs (ADR 0010) and the practical mock exam (ADR 0011), the user asked for polish: score history and
trends for mock exams, picking a lab or exam back up after a page refresh, and faster cluster startup.

A refresh kept the clusters and the clock (they live on the server) and tmux kept the shell, but the player lost
the exercise on screen, the flags (localStorage only), the docs tab, and a refresh during final grading showed a
terminal that was about to close. Boots streamed `docker save` of every preloaded image into every cluster after
its API was up, one image and one cluster at a time: about 18 s for a three-cluster lab on the sandbox, most of
it image loading.

## Decision

- `lab_session.player_state` (jsonb) holds the exercise index, flags, panel tab and docs page. The player saves
  it debounced and with `sendBeacon` on `pagehide`; the session page renders from it. Flags are now cross-device.
- `lab_session.ending_at` is set by the controller when it starts ending a session. The status API reports
  `ending`, the players show the grading screen, and the terminal token and relay refuse new terminals.
- A refresh or tab close is not counted as leaving the exam window (`pagehide` comes before the hidden event).
- A banner in the app shell shows a running lab or mock attempt on every page, with time left and a way back.
- Image cache: the controller saves the preload images once per set of image ids into the `lfct-image-cache`
  volume (a short-lived helper container writes the archives) and starts k3s with the archives linked into its
  airgap folder, so containerd imports them while k3s starts. After the nodes are Ready the controller checks
  each cluster and streams in only what is missing. Clusters, grader and workstation start in parallel.
  `LAB_IMAGE_CACHE=false` restores the old path. Folders unused for 14 days are removed.
- History: `/mocks/history` shows per-mock score trends (graded attempts, pass mark, exam vs practice markers),
  each domain's first-to-latest change, and every attempt; results pages compare with the previous attempt.
  Boot estimates come from the median of the last ten real boots of each lab on this machine.

## Consequences

- The three-cluster sample lab boots in about 9 s instead of about 18 s on the sandbox; the first boot of a new
  image set pays a few seconds to build the cache.
- The cache volume holds a few hundred MB; `docker volume rm lfct-image-cache` clears it safely.
- Mock results still do not feed readiness (unchanged from ADR 0011).
