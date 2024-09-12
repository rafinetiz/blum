import got from 'got';
import EventEmitter from 'node:events';

import { Api } from 'telegram';

const BLUMBOT_ID = 'BlumCryptoBot';

export default class Blum extends EventEmitter {
  /**
   * @param {import('telegram').TelegramClient} tg 
   */
  constructor(tg) {
    super();

    /** @type {import('telegram').TelegramClient} */
    this.tg = tg;

    const base = got.extend({
      http2: true,
      throwHttpErrors: false,
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
        response: 10000,
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
   * @param {string} t authorization token
   */
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
      );
      await this.tg.disconnect();

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
      return false;
    }

    const response = await this.http.userdomain.post('api/v1/auth/provider/PROVIDER_TELEGRAM_MINI_APP', {
      json: {
        'query': webappdata
      },
      responseType: 'json'
    });

    this.token = {
      access: response.body.token.access,
      refresh: response.body.token.refresh
    }

    this.emit('blum:token', response.body.token);

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
  
      if (Date.now() / 1000 > token.exp) {
        return false;
      }
      
      return true;
    } catch (err) {
      return false;
    }
  }
}