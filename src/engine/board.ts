/**
 * Chess board representation and utilities.
 * This implementation uses a simple 64‑square array (0‑63) where each square holds an integer code for the piece.
 * Positive numbers = White pieces, negative numbers = Black pieces.
 *  0: empty
 *  1: White Pawn   (WP)
 *  2: White Knight (WN)
 *  3: White Bishop (WB)
 *  4: White Rook   (WR)
 *  5: White Queen  (WQ)
 *  6: White King   (WK)
 * -1: Black Pawn   (BP)
 * -2: Black Knight (BN)
 * -3: Black Bishop (BB)
 * -4: Black Rook   (BR)
 * -5: Black Queen  (BQ)
 * -6: Black King   (BK)
 */

export type Piece = number;
export type Square = number; // 0‑63 (a1 = 0, h8 = 63)

export interface CastlingRights {
  /** White king‑side */
  WK: boolean;
  /** White queen‑side */
  WQ: boolean;
  /** Black king‑side */
  BK: boolean;
  /** Black queen‑side */
  BQ: boolean;
}

export interface BoardState {
  /** 64‑square array */
  squares: Piece[];
  /** Side to move: 'w' or 'b' */
  turn: 'w' | 'b';
  /** Castling rights */
  castling: CastlingRights;
  /** En‑passant target square index (0‑63) or null */
  enPassant: Square | null;
  /** Half‑move clock for fifty‑move rule */
  halfmoveClock: number;
  /** Full‑move number (starts at 1) */
  fullmoveNumber: number;
}

/** Initial board setup in array order a1..h8 */
export const initialBoard: BoardState = {
  squares: [
    // rank 1 (white back rank)
    4, 2, 3, 5, 6, 3, 2, 4,
    // rank 2 (white pawns)
    1, 1, 1, 1, 1, 1, 1, 1,
    // empty ranks 3‑6
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    // rank 7 (black pawns)
    -1, -1, -1, -1, -1, -1, -1, -1,
    // rank 8 (black back rank)
    -4, -2, -3, -5, -6, -3, -2, -4,
  ],
  turn: 'w',
  castling: { WK: true, WQ: true, BK: true, BQ: true },
  enPassant: null,
  halfmoveClock: 0,
  fullmoveNumber: 1,
};

/** Helper: convert (file, rank) to square index (0‑63). */
export const toSquare = (file: number, rank: number): Square => rank * 8 + file;
/** Helper: get file (0‑7) from square index */
export const fileOf = (sq: Square): number => sq % 8;
/** Helper: get rank (0‑7) from square index */
export const rankOf = (sq: Square): number => Math.floor(sq / 8);

/** Deep copy a BoardState */
export const cloneBoard = (b: BoardState): BoardState => {
  return {
    squares: b.squares.slice(),
    turn: b.turn,
    castling: { ...b.castling },
    enPassant: b.enPassant,
    halfmoveClock: b.halfmoveClock,
    fullmoveNumber: b.fullmoveNumber,
  };
};

/** Simple utility to flip side */
export const opposite = (side: 'w' | 'b'): 'w' | 'b' => (side === 'w' ? 'b' : 'w');

/**
 * Convert board to a FEN string (useful for debugging).
 */
export const boardToFEN = (b: BoardState): string => {
  const pieceChar = (p: Piece) => {
    if (p === 0) return '';
    const map: Record<number, string> = {
      1: 'P', 2: 'N', 3: 'B', 4: 'R', 5: 'Q', 6: 'K',
      '-1': 'p', '-2': 'n', '-3': 'b', '-4': 'r', '-5': 'q', '-6': 'k',
    } as any;
    return map[p] || '';
  };
  let fen = '';
  for (let r = 7; r >= 0; r--) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const sq = toSquare(f, r);
      const p = b.squares[sq];
      if (p === 0) {
        empty++;
      } else {
        if (empty > 0) { fen += empty; empty = 0; }
        fen += pieceChar(p);
      }
    }
    if (empty > 0) fen += empty;
    if (r > 0) fen += '/';
  }
  // turn
  fen += ' ' + b.turn;
  // castling rights
  let cr = '';
  if (b.castling.WK) cr += 'K';
  if (b.castling.WQ) cr += 'Q';
  if (b.castling.BK) cr += 'k';
  if (b.castling.BQ) cr += 'q';
  fen += ' ' + (cr || '-');
  // en passant
  if (b.enPassant !== null) {
    const file = fileOf(b.enPassant);
    const rank = rankOf(b.enPassant);
    const ep = String.fromCharCode(97 + file) + (rank + 1).toString();
    fen += ' ' + ep;
  } else {
    fen += ' -';
  }
  fen += ' ' + b.halfmoveClock;
  fen += ' ' + b.fullmoveNumber;
  return fen;
};
