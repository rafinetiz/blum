import got from 'got';
import { default as status_formatter } from 'statuses';

import EventEmitter from 'node:events';
import logger from './logger.js';
import { Api } from 'telegram';
import { randsleep, sleep, randomint } from './utils.js';
import dayjs from 'dayjs';

const BLUMBOT_ID = 'BlumCryptoBot';

export default class Blum extends EventEmitter {
  /**
   * @param {string} name
   * @param {import('telegram').TelegramClient} tg 
   */
  constructor(name, tg, game_worker) {
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
    /** @type {Worker} */
    this.__game_worker = game_worker;

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

              options.headers['authorization'] = 'Bearer ' + this.token.access;
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

      if ((Date.now() / 1000) > token.exp) {
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
   * @returns {Promise<URLSearchParams>} telegram webappdata
   */
  async GetWebAppData() {
    await this.tg.connect();
    const WebViewUrlResult = await this.tg.invoke(
      new Api.messages.RequestWebView({
        peer: await this.tg.getPeerId(BLUMBOT_ID),
        bot: await this.tg.getPeerId(BLUMBOT_ID),
        platform: 'android',
        fromBotMenu: false,
        url: 'https://telegram.blum.codes/'
      })
    ).finally(() => {
      this.tg.destroy();
    });

    const params = new URLSearchParams(
      WebViewUrlResult.url.substring(WebViewUrlResult.url.indexOf('#'))
    );

    const webappdata = params.get('#tgWebAppData');

    return new URLSearchParams(webappdata);
  }

  /**
   * @returns {Promise<{
   *  access: string;
   *  refresh: string;
   * }>}
   */
  async Login() {
    const webappdata = await this.GetWebAppData();
    const response = await this.http.userdomain.post('api/v1/auth/provider/PROVIDER_TELEGRAM_MINI_APP', {
      json: {
        'query': webappdata.toString()
      },
      responseType: 'json'
    });

    if (!response.ok) {
      return Promise.reject({
        code: 'NON_2XX_RESPONSE_ERR',
        status: `${response.statusCode} ${status_formatter(response.statusCode)}`,
        url: response.requestUrl.toString(),
        body: JSON.stringify(response.body),
        api_error: true
      });
    }

    const { token } = response.body;

    this.token = {
      access: token.access,
      refresh: token.refresh
    }

    this.emit('blum:token', token);

    return token;
  }

  /**
   * 
   * @returns {Promise<boolean>}
   */
  async RefreshToken() {
    const response = await this.http.userdomain.post('api/v1/auth/refresh', {
      json: {
        'refresh': this.token.refresh
      },
      responseType: 'json'
    });

    if (!response.ok) {
      return Promise.reject({
        code: 'NON_2XX_RESPONSE_ERR',
        status: `${response.statusCode} ${status_formatter(response.statusCode)}`,
        url: response.requestUrl.toString(),
        body: JSON.stringify(response.body),
        api_error: true
      });
    }

    const { access: accessToken, refresh: refreshToken } = response.body;

    this.token = {
      access: accessToken,
      refresh: refreshToken
    }

    return true;
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

      if ((Date.now() / 1000) > token.exp) {
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
   *  farming: {
   *   startTime: number;
   *   endTime: number;
   *  }
   * }>}
   */
  async GetBalance() {
    const response = await this.http.gamedomain.get('api/v1/user/balance', {
      responseType: 'json'
    });

    if (!response.ok) {
      return Promise.reject({
        code: 'NON_2XX_RESPONSE_ERR',
        status: `${response.statusCode} ${status_formatter(response.statusCode)}`,
        url: response.requestUrl.toString(),
        body: JSON.stringify(response.body),
        api_error: true
      });
    }

    /**
     * {
     *  availableBalance: string; // current balance
     *  playPasses: number; // ticket to play game
     *  isFastFarmingEnabled: boolean;
     *  timestamp: number; // current timestamp? in milliseconds
     *  farming: { // farming status
     *    startTime: number; // farming start time in milliseconds
     *    endTime: number; // time which farming can be claimed in milliseconds
     *    earningsRate: string;
     *    balance: string; // current balance farming has
     *  }
     * }
     */
    const {
      availableBalance: balance,
      playPasses: gameTicket,
      farming
    } = response.body;

    return {
      balance,
      gameTicket,
      farming
    }
  }

  /**
   * 
   * @returns {Promise<boolean>}
   */
  async ClaimDaily() {
    const response = await this.http.gamedomain.post('api/v1/daily-reward?offset=' + new Date().getTimezoneOffset());

    if (response.ok) {
      return true;
    }

    return Promise.reject({
      code: 'NON_2XX_RESPONSE_ERR',
      status: `${response.statusCode} ${status_formatter(response.statusCode)}`,
      url: response.requestUrl.toString(),
      body: response.body,
      api_error: true
    });
  }

  async ClaimFarming() {
    const response = await this.http.gamedomain.post('api/v1/farming/claim', {
      responseType: 'json'
    });

    if (!response.ok) {
      return Promise.reject({
        code: 'NON_2XX_RESPONSE_ERR',
        status: `${response.statusCode} ${status_formatter(response.statusCode)}`,
        url: response.requestUrl.toString(),
        body: JSON.stringify(response.body),
        api_error: true
      });
    }

    // TODO: correct return values
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
    const start_game = await this.http.gamedomain.post('api/v1/game/play', {
      responseType: 'json'
    });

    
  }

  /**
   * 
   * @returns {Promise<{
   *  balance: string;
   *  startTime: number;
   *  endTime: number;
   * }>}
   */
  async StartFarming() {
    const response = await this.http.gamedomain.post('api/v1/farming/start', {
      responseType: 'json'
    });

    if (!response.ok) {
      return Promise.reject({
        code: 'NON_2XX_RESPONSE_ERR',
        status: `${response.statusCode} ${status_formatter(response.statusCode)}`,
        url: response.requestUrl.toString(),
        body: JSON.stringify(response.body),
        api_error: true
      });
    }

    const { balance, startTime, endTime } = response.body;

    return {
      balance,
      startTime,
      endTime
    }
  }

  async Start() {
    const login = await this.Login().catch((err) => {
      logger.error(`${this.name} | ${err.message} | ${err.code} - ${JSON.stringify(err.cause, null, 2)}`);
      return false;
    });

    if (!login) {
      return;
    }

    this.on('blum:ticketAvailable', async (ticketCount) => {
      let j = ticketCount;
      for (let i = 0; i < ticketCount; i++) {
        logger.info(`${this.name} | claiming game ticket ${i}`);
        await this.PlayGame().then((result) => {
          logger.info(`${this.name} | game claim success | got=${result} | remainTicket=${j--}`);
        }).catch(err => {
          logger.error(`${this.name} | ${err.message} | error=${JSON.stringify(err.cause, null, 2)}`);
        });
      }
    });

    this.on('blum:farmingReady', async () => {
      await this.StartFarming().then((v) => {
        this.__farm_time = {
          start: v.startTime,
          end: v.endTime
        }

        logger.info(`${this.name} | start farming success | balance=${v.balance} | nextclaim=${(v.endTime - Date.now()) / 1000}s`);
      }).catch((err) => {
        logger.error(`${this.name} | ${err.message} | error=${JSON.stringify(err.cause, null, 2)}`);
      });
    });

    logger.info(`${this.name} | blum login success | sleep=5s`);
    await sleep(5000);

    await this.GetBalance().then(async v => {
      this.__farm_time = {
        start: v.startTime,
        end: v.endTime
      }

      logger.info(`${this.name} | balance=${v.balance} | gameTicket=${v.gameTicket} | NextClaimTime=${Math.max(0, (v.endTime - Date.now()) / 1000)}s`);
    });

    logger.info(`${this.name} | starting | sleep=5s`);
    await sleep(5000);

    while (true) {
      const now = Date.now();
      if (now > this.__next_claim_time) {
        await this.ClaimDaily()
          .then(async (result) => {
            if (result) {
              logger.info(`${this.name} | daily claim=ok`);
            } else {
              logger.info(`${this.name} | daily claim=same day`);
            }

            this.__next_claim_time = dayjs().add(1, 'day').valueOf();
          })
          .catch((err) => {
            logger.error(`${this.name} | ${err.message} | error=${JSON.stringify(err.cause, null, 2)}`);
          });

        /*
        await randsleep(5, 10).invoke();

        logger.info(`${this.name} | checking game daily passes`);
        await this.GetBalance().then((result) => {
          logger.info(`${this.name} | daily game pass result | gameTicket=${result.gameTicket}`);

          if (result.gameTicket > 0) {
            this.emit('blum:ticketAvailable', result.gameTicket);
          }
        }).catch(err => {
          logger.error(`${this.name} | ${err.message} | error=${JSON.stringify(err.cause, null, 2)}`);
        });
        */
      }

      if (now > this.__farm_time.end) {
        await this.ClaimFarming().then(async (result) => {
          logger.info(`${this.name} | farming claim success | balance=${result.balance}`);
          this.emit('blum:farmingReady');
        }).catch((err) => {
          logger.error(`${this.name} | ${err.message} | error=${JSON.stringify(err.cause, null, 2)}`);
        });

        await randsleep(5, 10).invoke();
      }

      await sleep(60000); // 1 minute
    }
  }
}
