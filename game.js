import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

import { Logger, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import Blum from './blum.js';
import { sleep } from './func.js';

const APP_ID = process.env.APP_ID;
const APP_HASH = process.env.APP_HASH;
const TG_LOGGER = new Logger('none');

const uuidv4 = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, ue => {
  const Yi = Math.random() * 16 | 0;
  return (ue === "x" ? Yi : Yi & 3 | 8).toString(16)
});

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

  await blum.Login();
  console.log('[#] Login blum success');

  console.log('[#] Starting game');
  const responses = await blum.http.gamedomain.post('api/v2/game/play').json();
  const { gameId } = responses;
  console.log('[#] Game started:', gameId);
  console.log('[#] Sleeping 50 seconds before claiming the game');

  await sleep(30000 + 20000); // 50detik

  console.log('[#] Trying claiming gameId:', gameId);
  const payload = {
    "CLOVER": {
      amount: '195'
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
  console.log(`[#] PoW - ${gameId}`);
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
  console.log(`[#] Payload - ${gameId}`);
  console.log(`[#] id     : ${pow.id}`);
  console.log(`[#] amount : 195 (random)`);
  console.log(`[#] hash   : ${pack.hash}`);

  worker.unref();

  console.log('[#] Sending request');
  const response = await blum.http.gamedomain.post('api/v2/game/claim', {
    json: {
      payload: pack.hash
    }
  }).text();
  console.log('[#] Game result:', gameId, response);
})();