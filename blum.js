import got from 'got';
import EventEmitter from 'node:events';
import logger from './logger.js';
import { Api } from 'telegram';
import { randsleep, sleep, randomint } from './func.js';
import dayjs from 'dayjs';

const BLUMBOT_ID = 'BlumCryptoBot';

export default class Blum extends EventEmitter {
  /**
   * @param {string} name
   * @param {import('telegram').TelegramClient} tg 
   */
  constructor(name, tg) {
    super();

    /** @type {string} */
    this.name = name;

    /** @type {import('telegram').TelegramClient} */
    this.tg = tg;
    
    /**
     * @type {{
     *  access: string;
     *  refresh: string
     * }}
     */
    this.token = undefined;

    /** @type {number} */
    this.__last_daily_time = 0;
    /** @type {{start: number; end: number;}} */
    this.__farm_time = {
      start: 0,
      end: 0
    };
    /** @type {boolean} */
    this.__refresh_flag = false;
    /** @type {number} */
    this.__next_claim_time = 0;

    const base = got.extend({
      http2: true,
      throwHttpErrors: false,
      hooks: {
        beforeRequest: [
          async (options) => {
            if (options.url.pathname.lastIndexOf('refresh') !== -1 || options.url.pathname.lastIndexOf('PROVIDER_TELEGRAM_MINI_APP') !== -1) {
              return;
            }

            if (this.IsTokenValid()) {
              options.headers['authorization'] = 'Bearer ' + this.token.access;
            } else {
              if (this.__refresh_flag) {
                return Promise.reject('request canceled because token currently being refreshed')
              }

              delete options.headers['authorization'];
              this.__refresh_flag = true;

              if (Blum.CheckRefreshToken(this.token.refresh)) {
                await this.RefreshToken().finally(() => {
                  this.__refresh_flag = false;
                });
              } else {
                await this.Login().finally(() => {
                  this.__refresh_flag = false;
                });
              }
            }
          }
        ]
      },
      headers: {
        'Origin': 'https://telegram.blum.codes',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',

        'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Microsoft Edge";v="128", "Microsoft Edge WebView2";v="128"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': 'Windows',
        'Sec-Fetch-Site': 'same-site',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',

        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',

        'Lang': 'en',
        'Priority': 'u=1, i'
      },
      timeout: {
        connect: 10000,
        response: 30000,
      }
    })

    /**
     * @type {{
     *  userdomain: got<{prefixUrl: 'https://user-domain.blum.codes'}>,
     *  gamedomain: got<{prefixUrl: 'https://game-domain.blum.codes'}>,
     * }}
     */
    this.http = {
      userdomain: base.extend({
        'prefixUrl': 'https://user-domain.blum.codes'
      }),
      gamedomain: base.extend({
        'prefixUrl': 'https://game-domain.blum.codes'
      })
    }
  }

  /**
   * @param {string} token 
   * @returns {boolean}
   */
  static CheckRefreshToken(tokenstr) {
    try {
      const token = JSON.parse(
        Buffer.from(tokenstr.split('.')[1], 'base64').toString()
      );
  
      if (Date.now() / 1000 > token.exp) {
        return false;
      }

      return true;
    } catch (err) {
      return false;
    }
  }

  setToken(t) {
    this.token = t;
  }
  /**
   * @returns {Promise<string>} telegram webappdata
   */
  async GetWebAppData() {
    try {
      await this.tg.connect();
      const WebViewUrlResult = await this.tg.invoke(
        new Api.messages.RequestWebView({
          peer: await this.tg.getPeerId(BLUMBOT_ID),
          bot: await this.tg.getPeerId(BLUMBOT_ID),
          platform: 'android',
          fromBotMenu: false,
          url: 'https://telegram.blum.codes/'
        })
      )

      return decodeURIComponent(
        decodeURIComponent(
          WebViewUrlResult.url.substring(42, WebViewUrlResult.url.indexOf('&', 42))
        )
      );
    } catch(err) {
      const error = new Error('get webappdata failed', {
        cause: err
      });

      error.code = 'BLUM_GETWEBAPP_ERR';

      throw error;
    } finally {
      /**
       * there's an bug using .disconnect().
       * calling .disconnect() not fully unregistering gramjs internal _updateLoop
       * more info: https://github.com/gram-js/gramjs/issues/615
       */
      await this.tg.destroy();
    }
  }

  async Login() {
    const webappdata = await this.GetWebAppData();

    const response = await this.http.userdomain.post('api/v1/auth/provider/PROVIDER_TELEGRAM_MINI_APP', {
      json: {
        'query': webappdata
      },
      responseType: 'json'
    });

    if (!response.ok) {
      const err = new Error('Login::response return non-200 code');
      err.code = 'ERR_RES_NON200';
      err.statusCode = response.statusCode;

      if (response.body) {
        err.body = JSON.stringify(response.body);
      }

      throw err;
    }

    this.token = {
      access: response.body.token.access,
      refresh: response.body.token.refresh
    }

    this.emit('blum:token', response.body.token);

    return true;
  }

  async RefreshToken() {
    const response = await this.http.userdomain.post('api/v1/auth/refresh', {
      json: {
        'refresh': this.token.refresh
      },
      responseType: 'json'
    });

    if (response.ok) {
      const body = response.body;

      this.token = {
        access: body.access,
        refresh: body.refresh
      }

      return true;
    } else {
      return Promise.reject(JSON.stringify(response.body))
    }
  }

  /**
   * @returns {boolean}
   */
  IsTokenValid() {
    if (!this.token) {
      return false;
    }

    try {
      const token = JSON.parse(
        Buffer.from(this.token.access.split('.')[1], 'base64').toString()
      );
  
      if (Date.now() / 1000 > token.exp) {
        return false;
      }
      
      return true;
    } catch (err) {
      return false;
    }
  }

  async GetMe() {
    const response = await this.http.userdomain.get('api/v1/user/me', {
      responseType: 'json'
    });

    console.log(response.body);
  }
  /**
   * @returns {Promise<{
   *  balance: string;
   *  gameTicket: number;
   *  startTime: number;
   *  endTime: number;
   *  currentTime: number;
   * }>}
   */
  async GetBalance() {
    const response = await this.http.gamedomain.get('api/v1/user/balance', {
      responseType: 'json'
    });

    const body = response.body;

    return {
      balance: body.availableBalance,
      gameTicket: body.playPasses,
      startTime: body.farming.startTime,
      endTime: body.farming.endTime,
      currentTime: body.farming.timestamp
    }
  }

  async ClaimDaily() {
    const response = await this.http.gamedomain.post('api/v1/daily-reward?offset=-180', {
      responseType: 'json'
    });

    if (!response.ok && response.body) {
      return Promise.reject(response.body.message);
    } else if (!response.ok) {
      console.error(response);
      return Promise.reject('unknown error');
    }

    return true;
  }

  async ClaimFarming() {
    const response = await this.http.gamedomain.post('api/v1/farming/claim', {
      responseType: 'json'
    });

    if (!response.ok && response.body) {
      return Promise.reject(response.body.message);
    } else if (!response.ok) {
      console.error(response);
      return Promise.reject('unknown error');
    }

    return {
      balance: response.body.availableBalance
    };
  }

  /**
   * Play game and claim the reward
   * 
   * @returns {Promise<number>} the points gained
   */
  async PlayGame() {
    const startGameResp = await this.http.gamedomain.post('api/v1/game/play', {
      responseType: 'json'
    });

    if (!startGameResp.ok) {
      return Promise.reject(`start game failed. ${JSON.stringify(startGameResp.body)}`);
    }

    const gameId = startGameResp.body.gameId;
    const points = randomint(190, 200);
    await sleep(30000 + 5000 + 5000 + 5000 + 5000);

    const claimGame = await this.http.gamedomain.post('api/v1/game/claim', {
      json: {
        gameId,
        points
      }
    });

    if (!claimGame.ok) {
      return Promise.reject(`game claim failed. ${claimGame.body}`);
    }

    return points;
  }

  async StartFarming() {
    const response = await this.http.gamedomain.post('api/v1/farming/start', {
      responseType: 'json'
    });

    if (!response.ok && response.body) {
      return Promise.reject(response.body.message);
    } else if (!response.ok) {
      console.error(response);
      return Promise.reject('unknown error');
    }

    const body = response.body;
    return {
      balance: body.balance,
      startTime: body.startTime,
      endTime: body.endTime
    }
  }

  async Start() {
    if (!this.IsTokenValid()) {
      try {
        await this.Login();

        const sleep = randsleep(5,15);
        logger.info(`${this.name} | BLUM LOGIN SUCCESS | sleep=${sleep.duration}s`);
        await sleep.invoke();
      } catch (error) {
        logger.error(`${this.name} | BLUM LOGIN FAILED | error=${error.message}`);
        if (error.code === 'ERR_RES_NON200') {
          logger.error(`status=${error.statusCode} | body=${error.body}`);
        }
      }
    }

    await this.GetBalance().then(async v => {
      this.__farm_time = {
        start: v.startTime,
        end: v.endTime
      }

      logger.info(`${this.name} | balance=${v.balance} | gameTicket=${v.gameTicket} | NextClaimTime=${Math.max(0, (v.endTime - Date.now()) / 1000)}s`);
    });

    const s = randsleep(3, 5);
    logger.info(`${this.name} | starting | sleep=${s.duration}`);
    await s.invoke();

    while (true) {
      const now = Date.now();
      if (now > this.__next_claim_time) {
        await this.ClaimDaily()
        .then(async () => {
          this.__next_claim_time = dayjs().add(1, 'day').valueOf();
          const sleep = randsleep(5, 15);
          logger.info(`${this.name} | daily claim success | sleep=${sleep.duration}s`);
          await sleep.invoke();
        })
        .catch((err) => {
          if (err == 'same day') {
            this.__next_claim_time = dayjs().add(1, 'day').valueOf();
          }
          
          logger.error(`${this.name} | daily claim failed | error=${err}`);
        })
  
        try {
          logger.info(`${this.name} | checking game daily passes`);
          let { gameTicket } = await this.GetBalance();
          const a = randsleep(2, 5);
          logger.info(`${this.name} | daily game passes | gameTicket=${gameTicket} | sleep=${a.duration}s`);
          await a.invoke();
          
          for (let i = 0; i < gameTicket; i++) {
            logger.info(`${this.name} | claiming game ticket ${i} | sleep=~40s`);
            await this.PlayGame()
            .then(async (point) => {
              const s = randsleep(5, 8);
              logger.info(`${this.name} | game claim success | got=${point} | remainTicket=${gameTicket--} | sleep=${s.duration}s`);
              await s.invoke();
            })
            .catch((err) => {
              logger.error(`${this.name} | game claim failed | error=${err}`);
            });
          }
        } catch (err) {
          logger.error(`${this.name} | failed requesting game passess | error=${err}`);
        }
      }

      if (now > this.__farm_time.end) {
        try {
          const { balance } = await this.ClaimFarming();
          const sleep = randsleep(5, 15);
          logger.info(`${this.name} | farming claim success | balance=${balance} | sleep=${sleep.duration}s`);
          await sleep.invoke();

          await this.StartFarming().then(async (v) => {
            this.__farm_time = {
              start: v.startTime,
              end: v.endTime
            }
            const sleep = randsleep(5, 15);
            logger.info(`${this.name} | start farming success | balance=${balance} | nextclaim=${(v.endTime - Date.now()) / 1000}s | sleep=${sleep.duration}s`);
            await sleep.invoke();
          }).catch((err) => {
            logger.error(`${this.name} | start farming failed | error=${err}`);
          });
        } catch (err) {
          logger.error(`${this.name} | farming claim failed | error=${err}`);
        }
      }

      await sleep(60000); // 1 minute
    }
  }
}
