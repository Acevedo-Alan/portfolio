/*
 * logic/Engine.js — Stockfish 17.1 (lite, single thread) running in a Web Worker, spoken to in UCI.
 * The files live in vendor/stockfish/ (same origin, because a Worker can't start from a CDN).
 * Stockfish is GPLv3: see vendor/stockfish/README.md and COPYING.txt.
 * Nothing runs on a server: the engine is WebAssembly in the visitor's browser.
 *
 * It does one thing at a time: bestMove() and analyze() calls wait in a queue, so their answers
 * can never get mixed up.
 */

const ENGINE_URL = 'vendor/stockfish/stockfish.js';

/** Turns a UCI score into centipawns for the side to move; forced mates count as ±10000 minus the distance. */
function toCentipawns(score) {
  if (!score) return 0;
  if (score.kind === 'mate') return (score.value > 0 ? 1 : -1) * (10000 - Math.abs(score.value));
  return score.value;
}

export class Engine {
  #worker;
  #waiters = [];           // { match(line) -> value|undefined, resolve }
  #queue = Promise.resolve();

  constructor() {
    this.#worker = new Worker(ENGINE_URL);
    this.#worker.onmessage = (e) => {
      const line = typeof e.data === 'string' ? e.data : '';
      this.#waiters = this.#waiters.filter((w) => {
        const value = w.match(line);
        if (value === undefined) return true;
        w.resolve(value);
        return false;
      });
    };
  }

  #send(command) { this.#worker.postMessage(command); }

  #until(match) { return new Promise((resolve) => this.#waiters.push({ match, resolve })); }

  /** Runs `task` after every earlier task has finished. */
  #enqueue(task) {
    const result = this.#queue.then(task);
    this.#queue = result.catch(() => {});
    return result;
  }

  /** Starts the engine. Rejects if it takes too long (for instance the .wasm didn't download). */
  async init() {
    const ready = this.#until((line) => (line === 'uciok' ? true : undefined));
    this.#send('uci');
    await Promise.race([ready, new Promise((_, reject) => setTimeout(() => reject(new Error('engine timeout')), 15000))]);
    this.newGame();
  }

  newGame() {
    this.#enqueue(() => this.#send('ucinewgame'));
  }

  /**
   * Asks for a move at a playing strength.
   * @param {string} fen
   * @param {{ skill: number, movetime: number }} level skill 0..20, thinking time in ms
   * @returns {Promise<string>} the move as "e2e4" (or "e7e8q")
   */
  bestMove(fen, { skill, movetime }) {
    return this.#enqueue(() => {
      const answer = this.#until((line) => (line.startsWith('bestmove') ? line.split(' ')[1] : undefined));
      this.#send(`setoption name Skill Level value ${skill}`);
      this.#send(`position fen ${fen}`);
      this.#send(`go movetime ${movetime}`);
      return answer;
    });
  }

  /**
   * Judges a position at full strength.
   * @returns {Promise<{ cp: number, mate: number|null, best: string }>} the score is for the side to
   *          move (cp: centipawns, mate: moves to mate, positive when that side is mating) and `best` is
   *          the best move as "e2e4"
   */
  analyze(fen, movetime = 350) {
    return this.#enqueue(() => {
      let score = null;
      const answer = this.#until((line) => {
        if (line.startsWith('info') && !/bound/.test(line)) {
          const found = /score (cp|mate) (-?\d+)/.exec(line);
          if (found) score = { kind: found[1], value: Number(found[2]) };
          return undefined;
        }
        if (!line.startsWith('bestmove')) return undefined;
        return { cp: toCentipawns(score), mate: score && score.kind === 'mate' ? score.value : null, best: line.split(' ')[1] };
      });
      this.#send('setoption name Skill Level value 20');
      this.#send(`position fen ${fen}`);
      this.#send(`go movetime ${movetime}`);
      return answer;
    });
  }

  dispose() {
    this.#waiters = [];
    this.#worker.onmessage = null;
    this.#worker.terminate();          // frees the WebAssembly memory right away
  }
}
