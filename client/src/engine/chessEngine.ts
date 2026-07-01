/**
 * LEO Chess Engine — Production AI
 * Minimax + Alpha-Beta Pruning + Negamax + Iterative Deepening + Quiescence Search
 * Transposition Table + Zobrist Hashing + Opening Book
 * Advanced Evaluation (Material, PSTs, Bishop Pair, Pawn Structure, Passed Pawns, Rook Activity, King Safety, Mobility)
 */

import { Chess } from 'chess.js';

// ─────────────────────────────────────────────────────────────────────────────
// Piece values (centipawns)
// ─────────────────────────────────────────────────────────────────────────────
const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// ─────────────────────────────────────────────────────────────────────────────
// Piece-Square Tables (from White's perspective, a1=0, h8=63)
// ─────────────────────────────────────────────────────────────────────────────
const PST_PAWN_MG = [
   0,  0,  0,  0,  0,  0,  0,  0,
  98,134, 61, 95, 68,126, 34,-11,
  -6,  7, 26, 31, 65, 56, 25,-20,
  -14, 13,  6, 21, 23, 12, 17,-23,
  -27, -2, -5, 12, 17,  6, 10,-25,
  -26, -4, -4,-10,  3,  3, 33,-12,
  -35, -1,-20,-23,-15, 24, 38,-22,
    0,  0,  0,  0,  0,  0,  0,  0,
];

const PST_KNIGHT = [
  -167,-89,-34,-49, 61,-97,-15,-107,
   -73,-41, 72, 36, 23, 62,  7, -17,
   -47, 60, 37, 65, 84,129, 73,  44,
   -9,  17, 19, 53, 37, 69, 18,  22,
   -13,   4, 16, 13, 28, 19, 21,  -8,
   -23,  -9, 12, 10, 19, 17, 25, -16,
   -29, -53,-12, -3, -1, 18,-14,  -19,
  -105, -21,-58,-33,-17,-28,-19,  -23,
];

const PST_BISHOP = [
  -29,  4,-82,-37,-25,-42,  7, -8,
  -26, 16,-18,-13, 30, 59, 18,-47,
  -16, 37, 43, 40, 35, 50, 37, -2,
   -4,  5, 19, 50, 37, 37,  7, -2,
   -6, 13, 13, 26, 34, 12, 10,  4,
    0, 15, 15, 15, 14, 27, 18, 10,
    4, 15, 16,  0,  7, 21, 33,  1,
  -33,-3,-14,-21,-13,-12,-39,-21,
];

const PST_ROOK = [
   32, 42, 32, 51, 63,  9, 31, 43,
   27, 32, 58, 62, 80, 67, 26, 44,
   -5, 19, 26, 36, 17, 45, 61, 16,
  -24,-11,  7, 26, 24, 35, -8,-20,
  -36,-26,-12, -1,  9, -7,  6,-23,
  -45,-25,-16,-17,  3,  0, -5,-33,
  -44,-16,-20, -9, -1, 11, -6,-71,
  -19,-13,  1, 17, 16,  7,-37,-26,
];

const PST_QUEEN = [
  -28,  0, 29, 12, 59, 44, 43, 45,
  -24,-39, -5,  1,-16, 57, 28, 54,
  -13,-17,  7,  8, 29, 56, 47, 57,
  -27,-27,-16,-16,  -1, 17, -2,  1,
   -9,-26, -9,-10, -2, -4,  3, -3,
  -14,  2,-11,  2, -2,  2, 14,  5,
  -35, -8, 11,  2,  8, 15, -3,  1,
   -1,-18, -9, 10,-15,-25,-31,-50,
];

const PST_KING_MG = [
  -65, 23, 16,-15,-56,-34,  2, 13,
   29, -1,-20, -7, -8, -4,-38,-29,
   -9, 24,  2,-16,-20,  6, 22,-22,
  -17,-20,-12,-27,-30,-25,-14,-36,
  -49, -1,-27,-39,-46,-44,-33,-51,
  -14,-14,-22,-46,-44,-30,-15,-27,
    1,  7, -8,-64,-43,-16,  9,  8,
  -15, 36, 12,-54,  8,-28, 24, 14,
];

const PST_KING_EG = [
  -74,-35,-18,-18,-11, 15,  4,-17,
  -12, 17, 14, 17, 17, 38, 23, 11,
   10, 17, 23, 15, 20, 45, 44, 13,
   -8, 22, 24, 27, 26, 33, 26,  3,
  -18, -4, 21, 24, 27, 23,  9,-11,
  -19, -3, 11, 21, 23, 16,  7, -9,
  -27,-11,  4, 13, 14,  4, -5,-17,
  -53,-34,-21,-11,-28,-14,-24,-43,
];

/** Return PST index for a piece on square sq for color c */
function pstIndex(sq: string, color: 'w' | 'b'): number {
  const file = sq.charCodeAt(0) - 97; // a=0, h=7
  const rank = parseInt(sq[1]) - 1;   // 1=0, 8=7
  if (color === 'w') {
    return (7 - rank) * 8 + file;
  } else {
    return rank * 8 + file;
  }
}

function getPST(type: string, color: 'w' | 'b', sq: string, endgame: boolean): number {
  const idx = pstIndex(sq, color);
  switch (type) {
    case 'p': return PST_PAWN_MG[idx];
    case 'n': return PST_KNIGHT[idx];
    case 'b': return PST_BISHOP[idx];
    case 'r': return PST_ROOK[idx];
    case 'q': return PST_QUEEN[idx];
    case 'k': return endgame ? PST_KING_EG[idx] : PST_KING_MG[idx];
    default:  return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Opening Book
// ─────────────────────────────────────────────────────────────────────────────
const OPENING_BOOK: Record<string, { from: string; to: string; promotion?: string }[]> = {
  // Starting position
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': [
    { from: 'e2', to: 'e4' },
    { from: 'd2', to: 'd4' },
    { from: 'g1', to: 'f3' },
    { from: 'c2', to: 'c4' },
  ],
  // 1. e4 e5
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6': [
    { from: 'g1', to: 'f3' },
  ],
  // 1. e4 c5 (Sicilian)
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6': [
    { from: 'g1', to: 'f3' },
    { from: 'b1', to: 'c3' },
  ],
  // 1. d4 d5
  'rnbqkbnr/pppppppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq d6': [
    { from: 'c2', to: 'c4' },
    { from: 'g1', to: 'f3' },
  ],
  // 1. e4 e5 2. Nf3 Nc6
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -': [
    { from: 'f1', to: 'b5' }, // Ruy Lopez
    { from: 'f1', to: 'c4' }, // Italian
    { from: 'd2', to: 'd4' }, // Scotch
  ],
};

function getShortenedFEN(chess: Chess): string {
  const fen = chess.fen();
  const parts = fen.split(' ');
  return parts.slice(0, 4).join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Zobrist Hashing
// ─────────────────────────────────────────────────────────────────────────────
let zobristPieces: Record<string, Record<string, number[]>> = {};
let zobristTurn: number;
let zobristCastling: number[] = [];
let zobristEnPassant: Record<string, number> = {};

function initZobrist() {
  const rand = () => Math.floor(Math.random() * 0x7fffffff);
  const colors = ['w', 'b'];
  const types = ['p', 'n', 'b', 'r', 'q', 'k'];
  
  for (const color of colors) {
    zobristPieces[color] = {};
    for (const type of types) {
      zobristPieces[color][type] = [];
      for (let i = 0; i < 64; i++) {
        zobristPieces[color][type][i] = rand();
      }
    }
  }
  
  zobristTurn = rand();
  
  for (let i = 0; i < 16; i++) {
    zobristCastling[i] = rand();
  }
  
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  for (const file of files) {
    zobristEnPassant[file] = rand();
  }
}

// Initialize immediately
initZobrist();

function getZobristHash(chess: Chess): number {
  let hash = 0;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece) {
        const sqIdx = r * 8 + c;
        hash ^= zobristPieces[piece.color][piece.type][sqIdx];
      }
    }
  }
  
  if (chess.turn() === 'b') {
    hash ^= zobristTurn;
  }
  
  // Castling
  let castlingIdx = 0;
  const fen = chess.fen();
  const parts = fen.split(' ');
  const castlingStr = parts[2] || '-';
  if (castlingStr.includes('K')) castlingIdx |= 1;
  if (castlingStr.includes('Q')) castlingIdx |= 2;
  if (castlingStr.includes('k')) castlingIdx |= 4;
  if (castlingStr.includes('q')) castlingIdx |= 8;
  hash ^= zobristCastling[castlingIdx];
  
  // En passant
  const epStr = parts[3];
  if (epStr && epStr !== '-') {
    const file = epStr[0];
    hash ^= zobristEnPassant[file] || 0;
  }
  
  return hash;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transposition Table
// ─────────────────────────────────────────────────────────────────────────────
const TT_EXACT = 0;
const TT_LOWERBOUND = 1;
const TT_UPPERBOUND = 2;

interface TTEntry {
  depth: number;
  score: number;
  flag: number;
  bestMove?: { from: string; to: string; promotion?: string };
}

const transpositionTable = new Map<number, TTEntry>();

// ─────────────────────────────────────────────────────────────────────────────
// Board evaluation
// ─────────────────────────────────────────────────────────────────────────────

function isEndgame(chess: Chess): boolean {
  const board = chess.board();
  let queenCount = 0;
  let minorCount = 0;
  for (const row of board) {
    for (const sq of row) {
      if (sq && sq.type === 'q') queenCount++;
      if (sq && (sq.type === 'n' || sq.type === 'b')) minorCount++;
    }
  }
  return queenCount === 0 || (queenCount <= 2 && minorCount <= 1);
}

/**
 * Static board evaluation from the perspective of the side to move.
 * Positive = good for active player, Negative = bad for active player.
 */
function evaluate(chess: Chess): number {
  if (chess.isCheckmate()) return -50000;
  if (chess.isStalemate() || chess.isDraw()) return 0;

  const eg = isEndgame(chess);
  const board = chess.board();
  const turn = chess.turn();

  let score = 0;

  // Trackers for advanced evaluation
  let whiteBishops = 0;
  let blackBishops = 0;
  
  const whitePawnFiles = Array(8).fill(0);
  const blackPawnFiles = Array(8).fill(0);
  
  const whitePawnRanks: number[][] = Array.from({ length: 8 }, () => []);
  const blackPawnRanks: number[][] = Array.from({ length: 8 }, () => []);
  
  let whiteKingPos = { r: 7, c: 4 };
  let blackKingPos = { r: 0, c: 4 };

  // 1. Scan board and sum up material + PST
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;

      const sq = String.fromCharCode(97 + c) + (8 - r);
      const val = PIECE_VALUES[piece.type] || 0;
      const pst = getPST(piece.type, piece.color, sq, eg);
      const total = val + pst;

      score += piece.color === turn ? total : -total;

      // Track info for advanced heuristics
      if (piece.type === 'b') {
        if (piece.color === 'w') whiteBishops++;
        else blackBishops++;
      }
      else if (piece.type === 'p') {
        if (piece.color === 'w') {
          whitePawnFiles[c]++;
          whitePawnRanks[c].push(7 - r);
        } else {
          blackPawnFiles[c]++;
          blackPawnRanks[c].push(r);
        }
      }
      else if (piece.type === 'k') {
        if (piece.color === 'w') {
          whiteKingPos = { r, c };
        } else {
          blackKingPos = { r, c };
        }
      }
    }
  }

  // 2. Bishop pair bonus
  const activeBishops = turn === 'w' ? whiteBishops : blackBishops;
  const oppBishops = turn === 'w' ? blackBishops : whiteBishops;
  if (activeBishops >= 2) score += 50;
  if (oppBishops >= 2) score -= 50;

  // 3. Pawn structure & passed pawns
  for (let c = 0; c < 8; c++) {
    // Doubled pawns
    if (whitePawnFiles[c] > 1) {
      score += turn === 'w' ? -15 * (whitePawnFiles[c] - 1) : 15 * (whitePawnFiles[c] - 1);
    }
    if (blackPawnFiles[c] > 1) {
      score += turn === 'b' ? -15 * (blackPawnFiles[c] - 1) : 15 * (blackPawnFiles[c] - 1);
    }

    // Isolated pawns
    const hasLeftW = c > 0 && whitePawnFiles[c - 1] > 0;
    const hasRightW = c < 7 && whitePawnFiles[c + 1] > 0;
    if (whitePawnFiles[c] > 0 && !hasLeftW && !hasRightW) {
      score += turn === 'w' ? -20 : 20;
    }
    const hasLeftB = c > 0 && blackPawnFiles[c - 1] > 0;
    const hasRightB = c < 7 && blackPawnFiles[c + 1] > 0;
    if (blackPawnFiles[c] > 0 && !hasLeftB && !hasRightB) {
      score += turn === 'b' ? -20 : 20;
    }

    // Passed pawns
    for (const rank of whitePawnRanks[c]) {
      let isPassed = true;
      for (const offset of [-1, 0, 1]) {
        const fileCheck = c + offset;
        if (fileCheck >= 0 && fileCheck < 8) {
          const blockingPawns = blackPawnRanks[fileCheck].filter(r => (7 - r) > rank);
          if (blockingPawns.length > 0) {
            isPassed = false;
            break;
          }
        }
      }
      if (isPassed) {
        const passedBonus = rank * 15;
        score += turn === 'w' ? passedBonus : -passedBonus;
      }
    }

    for (const rank of blackPawnRanks[c]) {
      let isPassed = true;
      for (const offset of [-1, 0, 1]) {
        const fileCheck = c + offset;
        if (fileCheck >= 0 && fileCheck < 8) {
          const blockingPawns = whitePawnRanks[fileCheck].filter(r => (7 - r) > rank);
          if (blockingPawns.length > 0) {
            isPassed = false;
            break;
          }
        }
      }
      if (isPassed) {
        const passedBonus = rank * 15;
        score += turn === 'b' ? passedBonus : -passedBonus;
      }
    }
  }

  // 4. Rook activity (open/semi-open files)
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.type === 'r') {
        const isWhiteRook = piece.color === 'w';
        const hasWhitePawns = whitePawnFiles[c] > 0;
        const hasBlackPawns = blackPawnFiles[c] > 0;
        let rookBonus = 0;
        if (!hasWhitePawns && !hasBlackPawns) {
          rookBonus = 30;
        } else if (isWhiteRook && !hasWhitePawns && hasBlackPawns) {
          rookBonus = 15;
        } else if (!isWhiteRook && !hasBlackPawns && hasWhitePawns) {
          rookBonus = 15;
        }
        score += piece.color === turn ? rookBonus : -rookBonus;
      }
    }
  }

  // 5. King safety (pawns shielding the king in middlegame)
  if (!eg) {
    if (whiteKingPos.r === 7 && whiteKingPos.c >= 5) {
      let shield = 0;
      if (board[6][5]?.type === 'p' && board[6][5]?.color === 'w') shield++;
      if (board[6][6]?.type === 'p' && board[6][6]?.color === 'w') shield++;
      if (board[6][7]?.type === 'p' && board[6][7]?.color === 'w') shield++;
      const penalty = (3 - shield) * -20;
      score += turn === 'w' ? penalty : -penalty;
    } else if (whiteKingPos.r === 7 && whiteKingPos.c <= 2) {
      let shield = 0;
      if (board[6][0]?.type === 'p' && board[6][0]?.color === 'w') shield++;
      if (board[6][1]?.type === 'p' && board[6][1]?.color === 'w') shield++;
      if (board[6][2]?.type === 'p' && board[6][2]?.color === 'w') shield++;
      const penalty = (3 - shield) * -20;
      score += turn === 'w' ? penalty : -penalty;
    }

    if (blackKingPos.r === 0 && blackKingPos.c >= 5) {
      let shield = 0;
      if (board[1][5]?.type === 'p' && board[1][5]?.color === 'b') shield++;
      if (board[1][6]?.type === 'p' && board[1][6]?.color === 'b') shield++;
      if (board[1][7]?.type === 'p' && board[1][7]?.color === 'b') shield++;
      const penalty = (3 - shield) * -20;
      score += turn === 'b' ? penalty : -penalty;
    } else if (blackKingPos.r === 0 && blackKingPos.c <= 2) {
      let shield = 0;
      if (board[1][0]?.type === 'p' && board[1][0]?.color === 'b') shield++;
      if (board[1][1]?.type === 'p' && board[1][1]?.color === 'b') shield++;
      if (board[1][2]?.type === 'p' && board[1][2]?.color === 'b') shield++;
      const penalty = (3 - shield) * -20;
      score += turn === 'b' ? penalty : -penalty;
    }
  }

  // 6. Mobility (bonus for number of legal moves)
  const mobility = chess.moves().length;
  score += 5 * mobility;

  return score;
}

// ─────────────────────────────────────────────────────────────────────────────
// Move ordering (MVV-LVA)
// ─────────────────────────────────────────────────────────────────────────────
function scoreMove(move: any, ttBest?: { from: string; to: string }): number {
  let s = 0;
  if (ttBest && move.from === ttBest.from && move.to === ttBest.to) {
    return 100000;
  }
  if (move.captured) {
    const victim   = PIECE_VALUES[move.captured] || 0;
    const attacker = PIECE_VALUES[move.piece]    || 0;
    s += 10 * victim - attacker + 10000;
  }
  if (move.promotion) s += PIECE_VALUES[move.promotion] || 0;
  
  const centerBonus: Record<string, number> = { e4:30,d4:30,e5:30,d5:30, e3:10,d3:10,f4:10,c4:10 };
  s += centerBonus[move.to] || 0;
  return s;
}

function orderMoves(moves: any[], ttBest?: { from: string; to: string }): any[] {
  return moves.slice().sort((a, b) => scoreMove(b, ttBest) - scoreMove(a, ttBest));
}

// ─────────────────────────────────────────────────────────────────────────────
// Quiescence search
// ─────────────────────────────────────────────────────────────────────────────
function quiescence(chess: Chess, alpha: number, beta: number, qdepth: number = 0): number {
  if (chess.isCheckmate()) return -50000;
  if (chess.isStalemate() || chess.isDraw()) return 0;

  const standPat = evaluate(chess);
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;

  if (qdepth >= 2) return alpha;

  const moves = chess.moves({ verbose: true }).filter(m => m.captured || m.promotion);
  if (moves.length === 0) return alpha;

  for (const move of orderMoves(moves)) {
    chess.move(move);
    const score = -quiescence(chess, -beta, -alpha, qdepth + 1);
    chess.undo();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

// ─────────────────────────────────────────────────────────────────────────────
// Negamax with Alpha-Beta and Transposition Table
// ─────────────────────────────────────────────────────────────────────────────
let nodesSearched = 0;
let searchAborted = false;

function negamax(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  startTime: number,
  timeLimit: number,
): number {
  nodesSearched++;
  if ((nodesSearched & 1023) === 0) {
    if (Date.now() - startTime > timeLimit) {
      searchAborted = true;
      return 0;
    }
  }

  if (chess.isGameOver()) {
    if (chess.isCheckmate()) return -50000 - depth;
    return 0;
  }

  if (depth === 0) {
    return quiescence(chess, alpha, beta, 0);
  }

  const alphaOrig = alpha;
  const hashKey = getZobristHash(chess);
  const ttEntry = transpositionTable.get(hashKey);
  
  if (ttEntry && ttEntry.depth >= depth) {
    if (ttEntry.flag === TT_EXACT) {
      return ttEntry.score;
    } else if (ttEntry.flag === TT_LOWERBOUND) {
      if (ttEntry.score >= beta) return ttEntry.score;
      if (ttEntry.score > alpha) alpha = ttEntry.score;
    } else if (ttEntry.flag === TT_UPPERBOUND) {
      if (ttEntry.score <= alpha) return ttEntry.score;
      if (ttEntry.score < beta) beta = ttEntry.score;
    }
    if (alpha >= beta) return ttEntry.score;
  }

  const moves = orderMoves(chess.moves({ verbose: true }), ttEntry?.bestMove);
  let bestScore = -Infinity;
  let bestMoveObj: any = null;

  for (const move of moves) {
    chess.move(move);
    const score = -negamax(chess, depth - 1, -beta, -alpha, startTime, timeLimit);
    chess.undo();

    if (searchAborted) return 0;

    if (score > bestScore) {
      bestScore = score;
      bestMoveObj = move;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }

  let flag = TT_EXACT;
  if (bestScore <= alphaOrig) {
    flag = TT_UPPERBOUND;
  } else if (bestScore >= beta) {
    flag = TT_LOWERBOUND;
  }
  
  transpositionTable.set(hashKey, {
    depth,
    score: bestScore,
    flag,
    bestMove: bestMoveObj ? { from: bestMoveObj.from, to: bestMoveObj.to, promotion: bestMoveObj.promotion } : undefined,
  });

  return bestScore;
}

// ─────────────────────────────────────────────────────────────────────────────
// Iterative Deepening
// ─────────────────────────────────────────────────────────────────────────────
export interface EngineResult {
  from: string;
  to: string;
  promotion?: string;
  san: string;
  score: number;
}

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'intermediate';

function depthForDifficulty(diff: Difficulty): number {
  switch (diff) {
    case 'easy':         return 2;
    case 'medium':
    case 'intermediate': return 3;
    case 'hard':         return 4;
    case 'expert':       return 5;
    default:             return 3;
  }
}

function randomnessFactor(diff: Difficulty): number {
  switch (diff) {
    case 'easy':   return 0.25;
    case 'medium': return 0.05;
    default:       return 0;
  }
}

export function getBestMove(chess: Chess, difficulty: Difficulty = 'medium'): EngineResult | null {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;

  const shortFen = getShortenedFEN(chess);
  const bookMoves = OPENING_BOOK[shortFen];
  if (bookMoves && bookMoves.length > 0 && difficulty !== 'easy') {
    const choice = bookMoves[Math.floor(Math.random() * bookMoves.length)];
    const match = moves.find(m => m.from === choice.from && m.to === choice.to);
    if (match) {
      return {
        from: match.from,
        to: match.to,
        promotion: match.promotion,
        san: match.san,
        score: 0,
      };
    }
  }

  const rf = randomnessFactor(difficulty);
  if (rf > 0 && Math.random() < rf) {
    const m = moves[Math.floor(Math.random() * moves.length)];
    return { from: m.from, to: m.to, promotion: m.promotion, san: m.san, score: 0 };
  }

  const maxDepth = depthForDifficulty(difficulty);
  const startTime = Date.now();
  const timeLimit = difficulty === 'expert' ? 3000 : 1500;

  nodesSearched = 0;
  searchAborted = false;

  let currentOrder = orderMoves(moves);
  let bestMove: any = currentOrder[0];
  let bestScore = -Infinity;

  if (transpositionTable.size > 60000) {
    transpositionTable.clear();
  }

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (Date.now() - startTime > timeLimit) break;

    let iterBest: any = currentOrder[0];
    let iterScore = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;
    let aborted = false;

    for (const move of currentOrder) {
      if (Date.now() - startTime > timeLimit) {
        aborted = true;
        break;
      }

      chess.move(move);
      const score = -negamax(chess, depth - 1, -beta, -alpha, startTime, timeLimit);
      chess.undo();

      if (searchAborted || aborted) {
        aborted = true;
        break;
      }

      if (score > iterScore) {
        iterScore = score;
        iterBest = move;
      }
      if (score > alpha) alpha = score;
    }

    if (!aborted && !searchAborted) {
      bestMove  = iterBest;
      bestScore = iterScore;
      currentOrder = [bestMove, ...currentOrder.filter(m => m !== bestMove)];
    } else {
      break;
    }
  }

  return {
    from: bestMove.from,
    to: bestMove.to,
    promotion: bestMove.promotion || (
      bestMove.piece === 'p' && (bestMove.to[1] === '1' || bestMove.to[1] === '8')
        ? 'q'
        : undefined
    ),
    san: bestMove.san,
    score: bestScore,
  };
}

export function getMaterialBalance(chess: Chess): number {
  const board = chess.board();
  let score = 0;
  for (const row of board) {
    for (const piece of row) {
      if (!piece || piece.type === 'k') continue;
      const val = PIECE_VALUES[piece.type] || 0;
      score += piece.color === 'w' ? val : -val;
    }
  }
  return Math.round(score / 100);
}
