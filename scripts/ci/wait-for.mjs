// Waits until each address answers, so the tests start only once their services are up:
//   node scripts/ci/wait-for.mjs tcp://postgres-test:5432 http://garage-test:3903/health
// A tcp:// address is ready when it accepts a connection; an http:// one when it answers at all
// (Garage's /health says 503 until the tests' setup gives it a layout, which is theirs to do).
import { connect } from "node:net";

const TIMEOUT_MS = 120_000;

function ready(address) {
  const url = new URL(address);
  if (url.protocol === "tcp:") {
    return new Promise((resolve) => {
      const socket = connect(Number(url.port), url.hostname);
      const done = (up) => {
        socket.destroy();
        resolve(up);
      };
      socket.once("connect", () => done(true));
      socket.once("error", () => done(false));
    });
  }
  return fetch(url).then(
    () => true,
    () => false,
  );
}

const addresses = process.argv.slice(2);
if (addresses.length === 0) throw new Error("usage: wait-for.mjs <tcp://host:port | http://…>…");

const deadline = Date.now() + TIMEOUT_MS;
for (const address of addresses) {
  while (!(await ready(address))) {
    if (Date.now() > deadline) throw new Error(`${address} did not come up in time`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.log(`ready: ${address}`);
}
