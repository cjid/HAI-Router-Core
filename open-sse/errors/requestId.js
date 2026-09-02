/**
 * HAI-Router request correlation IDs.
 */

let counter = 0;

export function createHaiRequestId() {
  counter = (counter + 1) % 0xffff;
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 10);
  const seq = counter.toString(36).padStart(2, "0");
  return `hai_req_${ts}_${rnd}_${seq}`;
}

export function resetRequestIdCounterForTests() {
  counter = 0;
}
