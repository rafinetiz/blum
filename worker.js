import { Worker } from 'node:worker_threads';
import { uuidv4 } from './utils.js';

export default class GameWorker {
  constructor(worker_threads) {
    /** @type {Worker} */
    this._worker = worker_threads;
    this._exited = false;
    this._last_error = null;
    this._code = -1;

    this._worker.on('error', (err) => {
      this._last_error = err;
      this._exited = true;
    });

    this._worker.on('exit', (code) => {
      this._code = code;
      this._exited = true;
    });
  }

  get exited() {
    return this._exited;
  }

  get last_error() {
    return this._last_error;
  }

  get code() {
    return this._code;
  }

  static create() {
    const thread = new Worker('./game_worker.js');

    return new GameWorker(thread);
  }

  async sendMessage(message) {
    if (this._exited) {
      throw new Error(`can't send message to worker threads because it already exited`)
    }

    this._worker.postMessage(message);
  }

  /**
   * @param {string} gameId gameid
   * @returns {Promise<{
   *  id: string; // message id
   *  nonce: number;
   *  hash: string;
   * }>}
   */
  async GetProofHash(gameId) {
    return new Promise((resolve, reject) => {
      const msgid = uuidv4();
      const cb = (message) => {
        if (message.id !== msgid) {
          return;
        }

        this._worker.removeListener('message', cb);
        if (message.error) {
          return reject(message);
        }

        resolve(message);
      }

      this._worker.on('message', cb);
      this.sendMessage({
        id: msgid,
        method: 'proof',
        payload: gameId
      });
    });
  }

  /**
   * @param {{
   *  gameId: string;
   *  challenge: { id: string; nonce: number; hash: string; }; // from GetProofHash
   *  earnedAssets: Record<string, { amount: string }>;
   * }} payload payload
   * @returns {Promise<{
    *  id: string; // message id
    *  hash: string;
    * }>}
    */
  async GetPackHash(payload) {
    return new Promise((resolve, reject) => {
      const msgid = uuidv4();
      const cb = (message) => {
        if (message.id !== msgid) {
          return;
        }

        this._worker.removeListener('message', cb);
        if (message.error) {
          return reject(message);
        }

        resolve(message);
      }

      this._worker.on('message', cb);
      this.sendMessage({
        id: msgid,
        method: 'pack',
        payload
      });
    });
  }
}
