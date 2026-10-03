# Blackjack Simulator

A practice table and simulation lab for advantage play. Play hands yourself, sit with card-counting bots or watch them play each other, and skip ahead any number of rounds to see long-run results.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine tests, including house-edge checks over 400k-round simulations
```

## What's in it

**Table**
- Play manually with chips, a bankroll, rebuys and keyboard shortcuts (H/S/D/P/R, Y/N for insurance, Enter to deal).
- Each decision is graded against basic strategy, or against Hi-Lo with the Illustrious 18 and Fab 4 index plays. "Show correct play" highlights the right button.
- A Hi-Lo running/true count HUD. Hide it to practise counting yourself, then use the count check to test your running count.
- Bots act at the table at your chosen speed (0.5× to Turbo), with play/pause and single-step. Their counts can be shown at their seats.
- **Skip ahead** any number of rounds. This runs in a Web Worker at roughly 200k–900k rounds/s, depending on the number of seats, shows progress, and can be stopped early while keeping the results. During a skip your seat either plays basic strategy at your last bet or sits out.

**Setup**
- Casino presets: Strip 6D S17/H17, Downtown 2D, single deck 3:2 and 6:5, Atlantic City 8D, European no-hole-card, and CSM. Every rule can also be set individually: decks, S17/H17, BJ payout, double restrictions, DAS, split limits, resplitting and hitting split aces, late surrender, hole card (ENHC), and insurance.
- Shuffle methods:
  - **Random**: a perfect shuffle at the cut card.
  - **Hand riffle**: a dealer-style shuffle of grabs with a configurable number of riffles. Few riffles leave clumps, which is what shuffle tracking exploits.
  - **CSM**: discards go back into the machine every round.
- Penetration and burn cards are configurable.
- 7 seats. Each one can be empty, you, or a bot:
  - Strategies: card counter, basic strategy (flat bet), mimic the dealer, never bust.
  - Counting systems: Hi-Lo, KO, Hi-Opt I/II, Omega II, Zen, Wong Halves, Red 7.
  - Counter settings: deck-estimation precision, index plays, insurance at the system's index, an editable bet ramp with presets, and wonging out below a count.
- Seeded RNG: the same seed and settings reproduce every card.

**Results**
- Per seat: net, edge, EV and SD per round and per hour, N0, risk of ruin, max drawdown, W/L/P, BJ/double/split/surrender counts, insurance P&L, index plays used, and your mistake rate.
- A bankroll curve for every seat, downsampled so runs of any length fit.
- Edge by true count for any seat, with bars faded where the sample is too small.

## Layout

- `src/engine/` is pure TypeScript with no DOM. It covers cards, rules, shoe and shuffles, counting systems, strategy charts and indices, the round state machine, and stats.
  - `game.ts` is the round state machine. `step()` advances one card or decision, so the UI can animate it.
  - `simulate.ts` loops `step()` to run rounds as fast as possible.
- `src/worker/` holds the skip-ahead worker. The game state is plain data, so it is cloned to the worker and back.
- `src/ui/` holds the React components.

## Accuracy notes

- Over 5M rounds, basic strategy measured −0.44% on 6D S17 DAS LS and −0.66% on H17. The published figures are about −0.3% and −0.5%; the gap is roughly 1–2 standard errors. A Hi-Lo counter with a 1–12 spread and 75% penetration measured about +1%.
- Index plays are native for Hi-Lo. For other balanced counts they are scaled by tag spread, which is approximate. Unbalanced counts (KO, Red 7) bet off the running count and do not use index plays.
- Insurance thresholds for balanced counts are derived from each system's correlation with ten-density. Hi-Lo comes out at +3, which matches the published index.
