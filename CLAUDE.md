# CLAUDE.md

A 1 v 1 spaceship fight on a phone, 2 to 4 minutes a battle: the pace of
The Expanse, the attitude of Firefly, later ship building like Cosmoteer
with a Star Trek bridge. One owner, who is the only player; discussion in
Vietnamese mixed with English; docs and code in English.

- Plain HTML, CSS and JavaScript ES modules. No framework, no npm, no
  build step. One page, served from a static server.
- Phone landscape first, about 844 × 390 CSS px, touch.
- Pseudo-physics: every effect has a cause and a consequence; deterministic
  (seeded random, no `Math.random` in the game logic); symmetric. No number
  needs a real-world source. Numbers live in one file, each with a
  one-line reason. Tune by doubling or halving.
- A system is built only when the owner says the last battle was boring
  or unfair without it. New ideas go to `NOTES.md` and are not built.
- Fun is judged by the owner on the phone, never by an AI.
- One branch and one pull request per change. Before work longer than
  about an hour, say so and wait.
- `STATUS.md` has three lines: what is playable, what the owner said last,
  the one thing being changed.
