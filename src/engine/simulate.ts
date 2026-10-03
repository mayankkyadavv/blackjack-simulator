import { step, type GameState } from './game';

const MAX_STEPS_PER_ROUND = 10_000;

/**
 * Play `rounds` complete table rounds as fast as possible. The human seat (if
 * any) is auto-played according to `humanMode`. Leaves the game at the start
 * of the next betting phase. Returns rounds actually completed.
 */
export function runRounds(
  g: GameState,
  rounds: number,
  humanMode: 'basic' | 'sitout' = 'basic',
): number {
  const events = g.events;
  g.events = null;
  g.autoplayHuman = humanMode;
  // Finish any round in progress first (it doesn't count toward `rounds`).
  if (g.phase !== 'betting') finishRound(g);
  const target = g.round + rounds;
  try {
    while (g.round < target) finishRound(g);
  } finally {
    g.events = events;
    g.autoplayHuman = null;
  }
  return rounds;
}

function finishRound(g: GameState) {
  const start = g.round;
  for (let i = 0; g.round === start; i++) {
    if (i > MAX_STEPS_PER_ROUND) throw new Error(`Round ${start} did not terminate (phase ${g.phase})`);
    step(g);
  }
}
