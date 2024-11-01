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

/**
 * Generate random uuid v4
 * 
 * @returns {string} uuid
 */
export function uuidv4() {
  const format = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";

  return format.replace(/[xy]/g, char => {
    const sym = Math.random() * 16 | 0;
    return (char === "x" ? sym : sym & 3 | 8).toString(16)
  });
}