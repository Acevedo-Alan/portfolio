/*
 * logic/ChessGame.js — the rules, through chess.js. No Three.js and no DOM here: it speaks only
 * in squares ("e2"), pieces ('p','n','b','r','q','k'; colors 'w','b') and FEN strings.
 * chess.js comes from the CDN (pinned); this module is loaded lazily with the Chess window.
 */

import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0/+esm';

export class ChessGame {
  #chess = new Chess();

  reset() { this.#chess = new Chess(); }

  get turn() { return this.#chess.turn(); }
  get fen() { return this.#chess.fen(); }
  get inCheck() { return this.#chess.inCheck(); }
  get isOver() { return this.#chess.isGameOver(); }
  get isCheckmate() { return this.#chess.isCheckmate(); }
  get canUndo() { return this.#chess.history().length > 0; }

  /** @returns {{square:string, type:string, color:string}[]} */
  position() {
    return this.#chess.board().flat().filter(Boolean).map(({ square, type, color }) => ({ square, type, color }));
  }

  /** The square of the king whose turn it is, when in check; otherwise null. */
  checkedKing() {
    if (!this.#chess.inCheck()) return null;
    const own = this.#chess.board().flat().find((cell) => cell && cell.type === 'k' && cell.color === this.#chess.turn());
    return own ? own.square : null;
  }

  /** Legal moves of the piece on `square`. @returns {{square:string, capture:boolean}[]} */
  movesFrom(square) {
    return this.#chess.moves({ square, verbose: true }).map((m) => ({ square: m.to, capture: m.flags.includes('c') || m.flags.includes('e') }));
  }

  /** True when moving the piece on `from` to `to` is a pawn reaching the last rank (the player must pick a piece). */
  isPromotion(from, to) {
    return this.#chess.moves({ square: from, verbose: true }).some((m) => m.to === to && m.promotion);
  }

  /** Every move played so far, in order. @returns {{san:string, color:string, piece:string, captured:string|null}[]} */
  history() {
    return this.#chess.history({ verbose: true }).map((m) => ({ san: m.san, color: m.color, piece: m.piece, captured: m.captured || null }));
  }

  /** Writes an engine move ("g1f3") in standard notation ("Nf3") as it would be played from `fen`. */
  static sanOf(fen, uci) {
    try {
      return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' }).san;
    } catch (e) { return uci; }
  }

  colorAt(square) {
    const piece = this.#chess.get(square);
    return piece ? piece.color : null;
  }

  /**
   * Plays a move. Pawns reaching the last rank become queens unless `promotion` says otherwise.
   * @returns the animation operations (see render/Pieces.js), or null if the move is illegal
   */
  move(from, to, promotion = 'q') {
    let move;
    try { move = this.#chess.move({ from, to, promotion }); } catch (e) { return null; }
    return { move, ops: this.#ops(move) };
  }

  /** Plays a move written as the engine does it: "e2e4", "e7e8q". */
  moveUci(uci) {
    return this.move(uci.slice(0, 2), uci.slice(2, 4), uci[4] || 'q');
  }

  /** Takes back the last move and returns nothing; callers re-read position(). */
  undo() { return this.#chess.undo(); }

  /** 'checkmate' | 'stalemate' | 'draw' | null */
  get result() {
    if (this.#chess.isCheckmate()) return 'checkmate';
    if (this.#chess.isStalemate()) return 'stalemate';
    if (this.#chess.isDraw()) return 'draw';
    return null;
  }

  /** Why a drawn game ended: 'material' | 'repetition' | 'fifty' (null if it isn't a draw). */
  get drawReason() {
    if (!this.#chess.isDraw() || this.#chess.isStalemate()) return null;
    if (this.#chess.isInsufficientMaterial()) return 'material';
    if (this.#chess.isThreefoldRepetition()) return 'repetition';
    return 'fifty';
  }

  /** Turns a played move into the simple steps the renderer animates, castling and en passant included. */
  #ops(move) {
    const ops = [];
    if (move.flags.includes('e')) ops.push({ type: 'capture', square: move.to[0] + move.from[1] });
    else if (move.flags.includes('c')) ops.push({ type: 'capture', square: move.to });
    ops.push({ type: 'move', from: move.from, to: move.to });
    const rank = move.from[1];
    if (move.flags.includes('k')) ops.push({ type: 'move', from: 'h' + rank, to: 'f' + rank });
    if (move.flags.includes('q')) ops.push({ type: 'move', from: 'a' + rank, to: 'd' + rank });
    if (move.promotion) ops.push({ type: 'promote', square: move.to, piece: move.promotion, color: move.color });
    return ops;
  }
}
