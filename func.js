/**
 * @param {number} min 
 * @param {number} max 
 */
export function randomint(min, max) {
  return Math.floor(Math.random() * (Math.floor(max) - Math.ceil(min) + 1) + Math.ceil(min));
}

/**
 * @param {number} min min number
 * @param {number} max max number
 * @returns {{
 *  duration: number;
 *  invoke: () => Promise<void>
 * }}
 */
export function randsleep(min, max) {
  const duration = randomint(min, max);

  return {duration, invoke: async function () {
    return await sleep(duration * 1000);
  }}
}

/**
 * @param {number} duration sleep duration in milliseconds
 * @returns {Promise<void>}
 */
export async function sleep(duration) {
  return new Promise(resolve => setTimeout(resolve, duration));
}