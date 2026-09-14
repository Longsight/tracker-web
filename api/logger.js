export const logger = (tag) => ({
  log: (msg) => console.log(`[${tag.padStart(8, ' ')}][---] ${msg}`),
  warn: (msg) => console.error(`[${tag.padStart(8, ' ')}][---] ${msg}`),
  err: (msg) => console.error(`[${tag.padStart(8, ' ')}][!!!] ${msg}`),
});