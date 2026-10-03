import { isRed, rankLabel, SUITS, suitOf, type Card } from '../engine/cards';

export function CardView({ card, hidden, small }: { card?: Card; hidden?: boolean; small?: boolean }) {
  const cls = `card${small ? ' card-sm' : ''}`;
  if (hidden || card === undefined) return <div className={`${cls} card-back`} aria-label="face-down card" />;
  const suit = SUITS[suitOf(card)];
  return (
    <div className={`${cls}${isRed(card) ? ' red' : ''}`} aria-label={`${rankLabel(card)}${suit}`}>
      <span className="card-rank">{rankLabel(card)}</span>
      <span className="card-suit">{suit}</span>
    </div>
  );
}
