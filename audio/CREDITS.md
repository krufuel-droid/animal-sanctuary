# Audio credits & license log (§6.3)

Every recorded file admitted to the game is logged here with source, license,
and the date it was admitted. Synthesized sounds (everything else) are code,
not files, and need no entry.

## vocal-purr.mp3 — admitted 2026-10-27

- **What:** a real domestic cat purr, trimmed to a 3.2 s seamlessly-looped
  segment (head/tail equal-power crossfade in place of 2 ms fades, so the
  loop point has no periodic dip), gently soft-shaped to lift its body,
  loudness −17.7 LUFS integrated, peak −1.3 dB, MP3 mono 44.1 kHz 64 kbps.
- **Why admitted:** the synthesized `vocal.purr` recipe failed Amanda's
  real-device ear-check on 2026-10-26 ("making the motor noises") — §6.3
  criterion (a). It replaces the synth for the cat's contented vocal and,
  slowed to ×0.75, for the hedgehog churr variant. The synth recipe remains
  in code as the pre-load / offline-render fallback only.
- **Source:** "Purring cat.oga" by Mysid, Wikimedia Commons —
  https://commons.wikimedia.org/wiki/File:Purring_cat.oga
  (direct file: https://upload.wikimedia.org/wikipedia/commons/d/db/Purring_cat.oga)
- **License:** released into the public domain worldwide by the author
  (CC0-equivalent dedication stated on the Commons file page; no attribution
  required — logged anyway per §6.3).
- **Segment used:** 1.2 s–4.9 s of the 9.8 s original (steady purr, no
  meows), loop constructed from 1.2 s–4.4 s with a 0.5 s seam crossfade.
