import { emitter, create_proof } from './gamesrc.js'
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { channel } from 'node:diagnostics_channel';

const uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, ue => {
  const Yi = Math.random() * 16 | 0;
  return (ue === "x" ? Yi : Yi & 3 | 8).toString(16)
});

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

const Mk = (S) => {
  const A = Object.keys(S);
  const k = { bp: "CLOVER", dogs: "DOGS" };

  return A.reduce((i, a) => {
    if (!S[a]) return i;
    const l = k[a];
    return (i[l] = { amount: String(S[a].value) }), i;
  }, {});
}

(async () => {

  //qp('2d1ec135-09bd-4c61-93ec-e712a554800d')
  /*
  emitter.emit('message', {
    id: '8f5ff764-4035-4f05-b08f-d2cb803982a9',
    method: 'proof',
    payload: '8f5ff764-4035-4f05-b08f-d2cb803982a9',
  });*/
  /*
  const proof = await create_proof('8f5ff764-4035-4f05-b08f-d2cb803982a9');
  console.log(proof)
  emitter.emit('message', {
    id: '8f5ff764-4035-4f05-b08f-d2cb803982a9',
    method: 'pack',
    payload: {
      gameId: '8f5ff764-4035-4f05-b08f-d2cb803982a9',
      challange: proof,
      earnedAssets: {
        bp: 100
      } 
    }
  })*/

  console.log(Mk({
    bp: {
      point: {type: 'bp', name: 'Blum points', icon: 'logo-token', logo: 'bp-logo'},
      value: 100,
    }
  }));

  const worker = new Worker('./game_worker.js');
  const gameId = uuid();
  const id = uuid();
  const proof = await awaitWorkerMessage(worker, {
    id: id,
    method: 'proof',
    payload: gameId
  });

  console.log(proof);
  const hash = await awaitWorkerMessage(worker, {
    id: id,
    method: 'pack',
    payload: {
      gameId,
      challenge: proof,
      earnedAssets: {
        "CLOVER": {
          amount: 190
        }
      }
    }
  });

  console.log(hash)
  /*
  worker.postMessage({
    id: uuid(),
    method: ''
  })*/

  worker.ref()
})()