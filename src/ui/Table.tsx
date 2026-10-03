import { handTotal, isBlackjack } from '../engine/cards';
import { bettingCount, getSystem } from '../engine/counting';
import type { GameState, Hand, Seat } from '../engine/game';
import { cardsRemaining } from '../engine/shoe';
import { CardView } from './CardView';
import { money, num, SEAT_COLORS, signedMoney } from './format';

const RESULT_LABEL: Record<string, string> = {
  win: 'WIN',
  lose: 'LOSE',
  push: 'PUSH',
  blackjack: 'BLACKJACK',
  surrender: 'SURRENDER',
  bust: 'BUST',
};

function totalLabel(cards: number[]) {
  if (!cards.length) return '';
  if (isBlackjack(cards)) return 'BJ';
  const { total, soft } = handTotal(cards);
  return soft && total < 21 ? `${total - 10}/${total}` : String(total);
}

export function Table({ game, showBotCounts }: { game: GameState; showBotCounts: boolean }) {
  const { dealer } = game;
  const dealerTotal = dealer.holeHidden ? totalLabel(dealer.cards.slice(0, 1)) : totalLabel(dealer.cards);
  return (
    <div className="felt">
      <div className="dealer">
        <div className="seat-label">Dealer</div>
        <div className="cards">
          {dealer.cards.length === 0 && <div className="card-slot" />}
          {dealer.cards.map((c, i) => (
            <CardView key={i} card={c} hidden={i === 1 && dealer.holeHidden} />
          ))}
        </div>
        {dealerTotal && <div className="total-pill">{dealerTotal}</div>}
        {game.phantom.length > 0 && (
          <div className="phantom">
            Other players
            <div className="cards">
              {game.phantom.map((c, i) => (
                <CardView key={i} card={c} small />
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="felt-text">
        {game.config.rules.blackjackPayout === 1.5 ? 'BLACKJACK PAYS 3 TO 2' : game.config.rules.blackjackPayout === 1.2 ? 'BLACKJACK PAYS 6 TO 5' : 'BLACKJACK PAYS EVEN MONEY'}
        <span>
          Dealer {game.config.rules.dealerHitsSoft17 ? 'hits' : 'stands on'} soft 17
          {game.config.rules.insurance && game.config.rules.dealerPeek ? ' · Insurance pays 2 to 1' : ''}
        </span>
      </div>
      <div className="seats">
        {game.seats.map((seat, i) => (
          <SeatView key={i} game={game} seat={seat} index={i} showCount={showBotCounts} />
        ))}
      </div>
    </div>
  );
}

function SeatView({ game, seat, index, showCount }: { game: GameState; seat: Seat; index: number; showCount: boolean }) {
  if (seat.config.kind === 'empty') return <div className="seat seat-empty" />;
  const isTurn = game.phase === 'playing' && game.turn.seat === index;
  const counterInfo =
    showCount && seat.counter
      ? (() => {
          const sys = getSystem(seat.counter.system);
          const c = bettingCount(seat.counter, cardsRemaining(game.shoe), seat.config.bot.deckEstimation);
          return `${sys.name.split(" (")[0]} ${sys.balanced ? 'TC' : 'RC'} ${num(c, 1)}`;
        })()
      : null;
  const out = seat.stats.ruinedAtRound !== null && seat.bankroll < game.config.table.minBet;
  return (
    <div className={`seat${isTurn ? ' seat-turn' : ''}${seat.config.kind === 'human' ? ' seat-human' : ''}`}>
      <div className="hands">
        {seat.hands.map((h, hi) => (
          <HandView key={hi} hand={h} active={isTurn && game.turn.hand === hi} />
        ))}
        {!seat.active && game.phase !== 'betting' && <div className="sitting-out">{out ? 'Broke' : 'Sitting out'}</div>}
      </div>
      <div className="seat-plate" style={{ borderTopColor: SEAT_COLORS[index] }}>
        <div className="seat-name">
          <span className="dot" style={{ background: SEAT_COLORS[index] }} />
          {seat.config.name}
        </div>
        <div className="seat-bankroll">{money(seat.bankroll)}</div>
        {seat.insurance > 0 && <div className="seat-sub">Insured {money(seat.insurance)}</div>}
        {counterInfo && <div className="seat-sub mono">{counterInfo}</div>}
        {game.phase === 'done' && seat.active && (
          <div className={`seat-net ${seat.roundNet > 0 ? 'pos' : seat.roundNet < 0 ? 'neg' : ''}`}>{signedMoney(seat.roundNet, seat.roundNet % 1 ? 2 : 0)}</div>
        )}
      </div>
    </div>
  );
}

function HandView({ hand, active }: { hand: Hand; active: boolean }) {
  return (
    <div className={`hand${active ? ' hand-active' : ''}`}>
      <div className="cards stacked">
        {hand.cards.map((c, i) => (
          <CardView key={i} card={c} />
        ))}
      </div>
      <div className="hand-meta">
        <span className="chip">{money(hand.bet)}</span>
        {hand.cards.length > 0 && <span className="total-pill small">{totalLabel(hand.cards)}</span>}
        {hand.result && <span className={`result result-${hand.result}`}>{RESULT_LABEL[hand.result]}</span>}
      </div>
    </div>
  );
}
