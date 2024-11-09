import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

import { Logger, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import Blum from './blum.js';
import { randomint, sleep, uuidv4 } from './utils.js';

const APP_ID = process.env.APP_ID;
const APP_HASH = process.env.APP_HASH;
const TG_LOGGER = new Logger('none');

async function check_session_exists(phone) {
  try {
    await fs.access(path.resolve('sessions', phone + '.json'), fs.constants.F_OK);
    return true;
  } catch (error) {

    return false;
  }
}
async function load_session(phone) {
  if (!(await check_session_exists(phone))) {
    throw new Error('session does not exists');
  }

  const content = await fs.readFile(path.resolve('sessions', phone + '.json'));

  return JSON.parse(content.toString())
}

async function awaitWorkerMessage(worker, data) {
  return new Promise((resolve) => {
    const cb = (data) => {
      resolve(data);
      worker.removeListener('message', cb);
    }

    worker.on('message', cb);
    worker.postMessage(data);
  });
}

(async () => {
  const nohp = "6283824006569";
  const session = await load_session(nohp).then(({ telegram }) => {
    return new StringSession(telegram.token);
  });

  const tg = new TelegramClient(session, parseInt(APP_ID), APP_HASH, {
    baseLogger: TG_LOGGER
  });
  await tg.connect();

  const me = await tg.getMe();
  console.log('[#] TGram : Logged as', me.firstName, `- ${me.username} (628382400xxxx)`);

  const blum = new Blum(me.phone, tg);

  for (let i = 0; i < 5; i++) {
    await blum.Login();
    console.log('[#] Login blum success');
    console.log(`[#] Starting game #${i}`);
    const responses = await blum.http.gamedomain.post('api/v2/game/play').json();
    const { gameId } = responses;
    console.log('[#] Game started:', gameId);

    const amount = 100// randomint(185, 203);
    let sleep_time = 30000 + 5000 + 5000 + (Math.random() > 0.5 ? 5000 : 0);

    if (amount > 195) {
      sleep_time += 10000;
    }

    console.log(`[#] Waiting ${sleep_time / 1000} seconds to act as in playing the game`);

    await sleep(sleep_time);

    console.log('[#] Trying claiming gameId:', gameId);
    const payload = {
      "CLOVER": {
        amount: amount.toString()
      }
    }

    const uuid = uuidv4();
    const worker = new Worker('./game_worker.js');

    console.log('[#] Generating PoW hash');
    const pow = await awaitWorkerMessage(worker, {
      id: uuid,
      method: 'proof',
      payload: gameId
    });
    console.log(`[#] PoW     ${gameId}`);
    console.log(`[#] id    : ${pow.id}`);
    console.log(`[#] nonce : ${pow.nonce}`);
    console.log(`[#] hash  : ${pow.hash}`);

    console.log('[#] Generating payload hash');
    const pack = await awaitWorkerMessage(worker, {
      id: uuid,
      method: 'pack',
      payload: {
        gameId,
        challenge: pow,
        earnedAssets: payload
      }
    });
    console.log(`[#] Payload  ${gameId}`);
    console.log(`[#] id     : ${pow.id}`);
    console.log(`[#] amount : ${amount} (random)`);
    console.log(`[#] hash   : ${pack.hash}`);

    worker.unref();

    console.log('[#] Sending request');
    const response = await blum.http.gamedomain.post('api/v2/game/claim', {
      json: {
        payload: pack.hash
      }
    }).text();
    console.log(`[#] Game #${i} result:`, gameId, response);

    await sleep(randomint(5000, 10000));
    console.log('');
  }
})();