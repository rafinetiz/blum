import ansi_styles from 'ansi-styles';

/**
 * @returns {string}
 */
function nowLocale() {
  return new Date().toLocaleString();
}

/**
 * @typedef {(text: string) => void} LogFunc
 */

/** @type {LogFunc} */
export function info(text) {
  process.stdout.write(`${ansi_styles.bold.open + ansi_styles.color.green.open}[${nowLocale()}] - [INFO]${ansi_styles.bold.close} [${text}]${ansi_styles.reset.close}\n`);
}

/** @type {LogFunc} */
export function error(text) {
  process.stdout.write(`${ansi_styles.bold.open + ansi_styles.color.red.open}[${nowLocale()}] - [ERROR]${ansi_styles.bold.close} [${text}]${ansi_styles.reset.close}\n`);
}

export default {
  info,
  error
}