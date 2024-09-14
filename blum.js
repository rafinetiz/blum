import got from 'got';
import EventEmitter from 'node:events';
import { Api } from 'telegram';
import { randsleep, sleep } from './func.js';
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
      ).catch(async () => {
        await this.tg.destroy();
      });
      /**
       * there's an bug using .disconnect().
       * calling .disconnect() not fully unregistering gramjs internal _updateLoop
       * more info: https://github.com/gram-js/gramjs/issues/615
       */
      await this.tg.destroy();

      return decodeURIComponent(
        decodeURIComponent(
          WebViewUrlResult.url.substring(42, WebViewUrlResult.url.indexOf('&', 42))
        )
      );
    } catch(err) {
      console.log(`Blum::GetWebAppData:`, err)

      return null
    }
  }

  async Login() {
    const webappdata = await this.GetWebAppData();

    if (webappdata === null) {
      const error = new Error('Login::webappdata is null');
      error.code = "ERR_WEBAPP_NULL";
      throw error;
    }

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

  /**
   * @returns {Promise<{
   *  balance: string;
   *  startTime: number;
   *  endTime: number;
   *  currentTime: number;
   * }>}
   */
  async GetBalance() {
    const response = await this.http.gamedomain.get('api/v1/user/balance', {
      headers: {
        'Authorization': 'Bearer ' + this.token.access
      },
      responseType: 'json'
    });

    const body = response.body;
    return {
      balance: body.farming.balance,
      startTime: body.farming.startTime,
      endTime: body.farming.endTime,
      currentTime: body.farming.timestamp
    }
  }

  async ClaimDaily() {
    const response = await this.http.gamedomain.post('api/v1/daily-reward?offset=-180', {
      headers: {
        'Authorization': 'Bearer ' + this.token.access
      },
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
      headers: {
        'Authorization': 'Bearer ' + this.token.access
      },
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

  async StartFarming() {
    const response = await this.http.gamedomain.post('api/v1/farming/start', {
      headers: {
        'Authorization': 'Bearer ' + this.token.access
      },
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
        console.log(`; ${this.name} | BLUM LOGIN SUCCESS | sleep=${sleep.duration}s`);
        await sleep.invoke();
      } catch (error) {
        console.log(`! ${this.name} | BLUM LOGIN FAILED | error=${error.message}`);
        if (error.code === 'ERR_RES_NON200') {
          console.log(`! status=${error.statusCode} | body=${error.body}`);
        }
      }
    }

    await this.GetBalance().then(async v => {
      this.__farm_time = {
        start: v.startTime,
        end: v.endTime
      }

      console.log(`; ${this.name} | balance=${v.balance} | NextClaimTime=${Math.max(0, (v.endTime - Date.now()) / 1000)}s`);
    });

    const s = randsleep(3, 5);
    console.log(`; ${this.name} | starting | sleep=${s.duration}`);
    await s.invoke();

    while (true) {
      const now = Date.now();
      if (now > this.__next_claim_time) {
        await this.ClaimDaily()
        .then(async () => {
          const sleep = randsleep(5, 15);
          console.log(`; ${this.name} | daily claim success | sleep=${sleep.duration}s`);
          await sleep.invoke();
        })
        .catch((err) => {
          console.log(`! ${this.name} | daily claim failed | error=${err}`);
        });
  
        this.__next_claim_time = dayjs().add(1, 'day').valueOf();
      }

      if (now > this.__farm_time.end) {
        try {
          const { balance } = await this.ClaimFarming();
          const sleep = randsleep(5, 15);
          console.log(`; ${this.name} | claim success | balance=${balance} | sleep=${sleep.duration}`);
          await sleep.invoke();

          await this.StartFarming().then(async (v) => {
            this.__farm_time = {
              start: v.startTime,
              end: v.endTime
            }
            const sleep = randsleep(5, 15);
            console.log(`; ${this.name} | start farming success | balance=${balance} | nextclaim=${(v.endTime - Date.now()) / 1000} | sleep=${sleep.duration}`);
            await sleep.invoke();
          }).catch((err) => {
            console.log(`! ${this.name} | start farming failed | error=${err}`);
          });
        } catch (err) {
          console.log(`! ${this.name} | claim failed | error=${err}`);
        }
      }

      await sleep(60000); // 1 minute
    }
  }
}
