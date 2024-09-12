import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import ansi_styles from 'ansi-styles';
import Blum from './blum.js';

import { select, input, Separator } from '@inquirer/prompts';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';


const APP_ID = process.env.APP_ID;
const APP_HASH = process.env.APP_HASH;

async function check_session_exists(phone) {
  try {
    await fs.access(path.resolve('sessions', phone + '.json'), fs.constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * @typedef {{
 *  telegram: { username: string; token: string },
 *  blum?: { access: string; refresh: string }
 * }} SessionObject
 */

/**
 * @param {string} phone phone number
 * @param {SessionObject} session_object
 * @returns {Promise<boolean>}
 */
async function save_session(phone, session_object) {
  try {
    const sesspath = path.resolve('sessions', phone + '.json');
    
    await fs.writeFile(sesspath, JSON.stringify(session_object, null, 2));
    return true;
  } catch (err) {
    console.log(`${ansi_styles.bold.open + ansi_styles.color.red.open}! Gagal untuk menyimpan sesi!${ansi_styles.reset.close}`, err);
    return false;
  }
}

/**
 * load session for **phone** from file\
 * this internally calling *check_session_exists* so you don't need to call it.
 * 
 * throw an error if
 * - session file does not exists
 * - invalid format
 * @param {string} phone
 * @returns {Promise<SessionObject>} session
 */
async function load_session(phone) {
  if (!(await check_session_exists(phone))) {
    throw new Error('session does not exists');
  }

  const content = await fs.readFile(path.resolve('sessions', phone + '.json'));

  return JSON.parse(content.toString())
}

async function start_farming() {
  console.log('; Memuat akun...');
  const list = await fs.readdir('sessions');

  list.forEach(async (item, i) => {
    const phonenum = item.replace('.json', '');
    const session = await load_session(phonenum);
    const tg = new TelegramClient(new StringSession(session.telegram.token), parseInt(APP_ID), APP_HASH);
    const blum = new Blum(session.telegram.username, tg);
    blum.on('blum:token', (token) => {
      save_session(phonenum, {
        ...session,
        blum: {
          access: token.access,
          refresh: token.refresh
        }
      });
    });

    if (session.blum) {
      blum.setToken(session.blum);
    }

    blum.Start()
  });
}

(async () => {
  const action = await select({
    message: 'What to do?',
    choices: [
      new Separator(),
      {
        name: 'Mulai Farming',
        value: 'start_farming'
      },
      new Separator(),
      {
        name: 'Lihat Sesi',
        value: 'list_session'
      },
      {
        name: 'Tambah sesi',
        value: 'add_session'
      }
    ]
  }).catch(r => {
    console.log(r.message)
    process.exit(1)
  });

  switch (action) {
    case 'start_farming':
      await start_farming();
      break;
    case 'list_session':
      const list = await fs.readdir('sessions');

      list.forEach(async (item, i) => {
        const phonenum = item.replace('.json', '');
        const session = await load_session(phonenum);

        console.log(`${ansi_styles.bold.open}; ${i} | +${phonenum} | ${ansi_styles.color.cyan.open + session.telegram.username + ansi_styles.reset.close}`)
      });
      break;
    case 'add_session':
      const phonenum = await input({
        message: 'Phone number?',
        required: true
      });

      if (await check_session_exists(phonenum.replace('+', ''))) {
        return console.log(`${ansi_styles.bold.open}! Sesi untuk nomor ${ansi_styles.color.cyan.open + phonenum + ansi_styles.color.close} sudah ada ${ansi_styles.reset.close}`);
      }
      
      const tg = new TelegramClient(new StringSession(''), parseInt(APP_ID), APP_HASH);
      
      console.log('; Mencoba login');
      
      await tg.start({
        phoneNumber: phonenum,
        phoneCode: async () => await input({
          message: 'Code?',
          required: true
        }),
        onError: (err) => {
          console.log(`${ansi_styles.bold.open + ansi_styles.color.red.open}! Telegram login gagal!${ansi_styles.reset.close}`, err);
        }
      });

      const { username } = await tg.getMe();
      await save_session(phonenum.replace('+', ''), {
        telegram: {
          username,
          token: tg.session.save()
        }
      });

      console.log(`${ansi_styles.bold.open}; Login sukses sebagai ${ansi_styles.color.cyan.open + username + ansi_styles.reset.close}`);
      break;
  }
})();