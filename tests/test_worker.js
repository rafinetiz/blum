import { uuidv4 } from '../utils.js';
import GameWorker from '../worker.js';

(async () => {
  const gameworker = GameWorker.create();

  const gameid = uuidv4();
  const proof = await gameworker.GetProofHash(gameid);
  await gameworker.GetPackHash({
    gameId: gameid,
    challenge: proof,
    earnedAssets: {
      "CLOVER": {
        amount: "129"
      }
    }
  }).then(console.log).catch(console.error)

})();