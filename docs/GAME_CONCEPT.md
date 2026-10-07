# Kill the King — Game Concept

_A plain-English description of the whole game, for the team._

This document exists so everyone on the team — design, art, audio, QA, marketing,
and the people new to the project — can share the same mental picture of what we
are building and why it feels the way it does. It intentionally avoids code and
technical jargon. If you need the plumbing details, ask the engineers to point you
at the implementation docs.

---

## 1. The one-line pitch

**Kill the King** is a tense, two-player game of hiding, guessing, and bluffing.
One player secretly hides the King somewhere on the table, the other races against
a ticking clock to find it — and neither can ever fully trust the other.

It plays in minutes, on a phone, with dramatic card animations and cinematic
tension. Think _liar's game meets a duel_, wrapped in an opulent, dark-royal
theme.

---

## 2. The core fantasy (feeling we want)

Above everything, a round should feel like a heartbeat: hide → tense silence →
decide → **reveal**. We are selling three feelings:

- **Suspense** — the Guesser can't see the truth; every second of the timer is felt.
- **Deception** — the Dealer can lie, and being caught (or getting away with it)
  is the emotional peak of the game.
- **Showmanship** — cards are dealt with motion, the reveal lands with drama, and
  sound swells at the exact right moment. Even a wrong guess should feel cinematic.

The visual and audio direction is dark, moody, and royal: gold on near-black,
a playing-card court where a crown always sits somewhere above the action.

---

## 3. What the game is (and isn't)

| It is….                                   | It isn't….                         |
| ----------------------------------------- | ---------------------------------- |
| A fast, round-based bluff & guess game    | A long, heavy strategy board game  |
| Playable in a couple of minutes per match | A collectible / deck-building game |
| A showdown between exactly **two** people | A big multiplayer lobby game       |
| Presentation-forward and dramatic         | A plain "guess the card" utility   |

---

## 4. The stages of a match

The whole game is built around a short, repeatable loop. Each time through the
loop is a **round**, and a match is just many rounds in a row.

### The three courts (levels)

A match is divided into **three courts** that get progressively harder and more
dangerous as you climb:

1. **The Court** — 5 cards on the table, 20 seconds to act, low stakes.
2. **High Stakes** — 3 cards, 15 seconds, more points on the line and less room
   to hide.
3. **The Final Duel** — only **2 cards**, 9 frantic seconds, everything decided.

Fewer cards means a sharper, faster, more personal duel. Each court has its own
look and intensity so players always know how deep into the kingdom they are.

### Roles: Dealer and Guesser

In every round the two players take opposite jobs:

- **The Dealer** secretly decides where the King is hidden (or whether to gamble
  with a bluff).
- **The Guesser** must find the King or call out a bluff, all under a timer.

The roles move in **complete turns** by default — inside each court one player
hides the first five rounds and the other hides the last five, so a "Dealer
streak" builds. Prefer the classic rhythm instead? Switch to **alternate turns**,
where the Dealer trades every round.

### Anatomy of a single round

1. **Hide.** The Dealer looks at the table and secretly tucks the King behind one
   of the face-down cards — or decides not to place a King at all (a bluff).
2. **Pass the table.** In two-player-passing play, control literally moves to the
   other side of the table.
3. **Shuffle & deal.** The cards are shuffled with a flourish so the Guesser
   genuinely cannot track where the King went.
4. **Guess.** The Guesser racks the timer and either:
   - taps the card they believe hides the King, **or**
   - **calls the bluff**, accusing the Dealer of hiding nothing at all.
5. **Reveal.** The truth comes out in a dramatic flip, and the result is tallied.

### The possible outcomes

| What happened                                                   | Who wins the round                 |
| --------------------------------------------------------------- | ---------------------------------- |
| **King found** — Guesser picked the right card                  | The Guesser                        |
| **Wrong card** — guessed one that was empty                     | The Dealer                         |
| **Bluff caught** — Guesser called it, was right                 | The Guesser                        |
| **Bluff missed** — Guesser called it, was wrong                 | The Dealer                         |
| **Bluff worked** — Dealer bluffed, Guesser picked a card anyway | The Dealer                         |
| **Time ran out** — Guesser froze                                | The Dealer (the King stays hidden) |

---

## 5. The dangerous third option: the Bluff

Each player gets **one bluff per court**. A bluff means the Dealer places no King
at all and faces the Guesser across an empty table.

Bluffs are the soul of the game. When you see a confident Dealer, you must ask:
_is the King really down there, or am I being played?_ Calling a bluff on a truth
is a costly mistake — you hand the round over. Letting a real bluff slide hands it
over too. Reading people, not cards, is what separates a good player from a great
one.

> Only one bluff each, per court. Use it when it counts.

---

## 6. Scoring and winning

### Classic score mode (the default)

Points are won per round and grow as the courts escalate:

- The Court: **1 point**
- High Stakes: **2 points**
- Final Duel: **3 points**

Each court declares how many times **each player** hides — 7, then 5, then 3 — so
a court runs twice that many rounds (14, 10 and 6). At the end of all three
courts — thirty rounds of hide-and-seek — the player with the most points wins
the kingdom.

### Optional "5 Lives" mode

For matches that want survival tension instead of a running score, each player
starts with **5 Kings (lives)**. The only way to cost an opponent a King is to
**find their hidden King** — a correct find takes one of theirs. Wrong guesses,
missed bluffs, even timeouts don't touch lives; they just burn a round of pressure.

The first player to lose all five Kings loses. If the full set of rounds runs out,
whoever has more Kings left wins.

---

## 7. The games you can play

The same heart — hide, bluff, guess — ships in three shells so the game fits how
and where someone wants to play.

### 1. Versus a Bot ("The Rival")

One human plays against a computer opponent with a personality (named _The
Rival_). Great for learning, practicing bluffs, and quick solo sessions. The bot
hides, guesses, and occasionally bluffs to keep you honest.

### 2. Two players, one device (local pass-and-play)

Two friends share one screen and physically hand the device back and forth. The
Dealer hides while the other looks away, then passes the table over. Ideal for
showing the game off in person — no internet needed.

### 3. Online multiplayer (two humans, anywhere)

Match against a real person over the internet. You can:

- **Create a private table** and share a join code with a friend, or
- **Search for an opponent** and be matched automatically with someone looking for
  a game.

Like any real duel, online play keeps each player's secrets honest: the person
hiding the King truly keeps it to themselves until the reveal, so bluffs are real
and no one can cheat by peeking. Each online match opens with the table settings —
which court style and scoring the two players agree to — and a forfeit or lost
connection hands you back to the menu to rematch or find someone new.

All three shells share the exact same rules and the same dramatic look, so a
player who learns one already knows them all.

---

## 8. Features that make it feel alive

Beyond the core loop, a handful of tools give players depth and the game polish.

### Strategy map ("constellation")

Over several rounds, the game quietly remembers which cards you tend to guess and
draws a **constellation line** across a card grid. It highlights a truth most
players won't admit: human beings are creatures of habit. Seeing your own pattern
— or your opponent's — lets the sharpest players exploit predictability and break
their own. It reframes the "same old rounds" into a subtle mind game layered on
top of the guessing.

### Extra ways to adjust a match

- **Complete turns vs. alternate turns** — give each side a block of consecutive
  rounds so a "Dealer streak" builds (the default), or trade Dealer every round.
- **Classic score vs. 5 Lives** — pick the win condition that suits the mood.

### Crafted presentation

- Cinematic **turn transitions** and animated dealing so every new round feels like
  a scene change, not a reload.
- A **reveal that lands** — cards flip, the King is crowned, wrong picks shatter on
  screen.
- **Audio that breathes** with the game: ambient music underneath, a counting
  clock that quickens the heartbeat near zero, and distinct stingers for finding
  the King, a wrong guess, a caught bluff, and a bluff that slipped through.
- Full mobile-first design with comfortable touch targets and safe-area handling,
  so the cinematic feel survives on a real phone screen.

### Comfort & control

Accessibility-minded toggles let players lower **motion** (reduce animations) and
turn **sound** off, without losing the game itself — important for both comfort and
for people sensitive to flashes or loud cues.

---

## 9. The nouns of our world (shared vocabulary)

Using one consistent set of words keeps the art, copy, and gameplay in sync. When
you write UI text or name a screen, prefer these:

| Term                                     | Meaning                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| **The King**                             | The hidden card the Guesser hunts for.                                 |
| **Dealer**                               | The player hiding the King (and possibly bluffing).                    |
| **Guesser**                              | The player trying to find the King or call the bluff.                  |
| **The Court / High Stakes / Final Duel** | The three difficulty stages of a match.                                |
| **Bluff**                                | Hiding no King at all; one allowed per player per court.               |
| **Call the bluff**                       | The Guesser accusing the Dealer of bluffing instead of picking a card. |
| **Reveal**                               | The dramatic moment the truth is flipped over.                         |
| **The Rival**                            | The name of the computer opponent.                                     |
| **Kings (lives)**                        | In 5-Lives mode, the survival resource (each player's five Kings).     |
| **Constellation**                        | The strategy-map line drawn from a player's recent guessing habits.    |

---

## 10. The emotional arc of a full match

A well-designed match should rise and fall:

1. **The Court** eases you in — more cards, more space, lower stakes. Confidence grows.
2. **High Stakes** tightens the table and doubles the hurt of a mistake. Bluffs
   become tempting.
3. **The Final Duel** strips the table to two cards and nine seconds. There is
   nowhere left to hide — literally.

Thirty rounds is enough to build a genuine rivalry in one sitting (with the
Dealer/Guesser roles and pitfalls creating comeback moments), yet short enough
that "one more match" is irresistible.

---

## 11. Where we are and what we optimise for

- **Platform.** A phone-first web game (installed and playable like a native app on
  Android), with desktop browsers as a natural secondary surface.
- **Scope of a match.** Quick to start, quick to finish, built to be replayed.
- **Honesty at the core.** Whether it's one device passed around or a duel over the
  internet, the hidden King stays genuinely hidden until the reveal. That trust is
  the whole game — protect it in every mode.
- **The two classic modes are the baseline.** Score-based 3-court play is the
  default everyone meets first; the optional 5-Lives and turn-order rule-sets are
  additive layers for players who want them, never replacements.

---

_Questions, contradictions, or ideas that don't fit the above? Raise them with the
whole team — this document is meant to be argued with, so the shared picture stays
true to what we actually ship._
