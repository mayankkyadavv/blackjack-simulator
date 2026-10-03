/**
 * A card is an integer 0..51: rank = card % 13 (0 = A, 1 = 2, ... 9 = 10,
 * 10 = J, 11 = Q, 12 = K), suit = floor(card / 13). Ints keep the hot
 * simulation loop allocation-free.
 */
export type Card = number;

export const SUITS = ['♠', '♥', '♦', '♣'] as const;
const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const rankOf = (c: Card) => c % 13;
export const suitOf = (c: Card) => Math.floor(c / 13);
export const isRed = (c: Card) => suitOf(c) === 1 || suitOf(c) === 2;

/** Blackjack value with ace = 1. */
export function cardValue(c: Card): number {
  const r = c % 13;
  return r >= 9 ? 10 : r + 1;
}

export const rankLabel = (c: Card) => RANK_LABELS[c % 13];
export const cardLabel = (c: Card) => rankLabel(c) + SUITS[suitOf(c)];

/** Dealer upcard as 2..11 (ace = 11) — the index used by strategy tables. */
export function upcardIndex(c: Card): number {
  const v = cardValue(c);
  return v === 1 ? 11 : v;
}

export interface HandTotal {
  total: number;
  soft: boolean;
}

export function handTotal(cards: readonly Card[]): HandTotal {
  let total = 0;
  let aces = 0;
  for (let i = 0; i < cards.length; i++) {
    const v = cardValue(cards[i]);
    total += v;
    if (v === 1) aces++;
  }
  if (aces > 0 && total + 10 <= 21) return { total: total + 10, soft: true };
  return { total, soft: false };
}

export function isBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && handTotal(cards).total === 21;
}
