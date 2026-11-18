
const TARGETS = [
  {
    name: 'gateway',
    url: process.env.GATEWAY_URL || 'http://localhost:8080',
  },
  {
    name: 'product-service',
    url: process.env.PRODUCT_URL || 'http://localhost:3000',
  },
  {
    name: 'order-service',
    url: process.env.ORDER_URL || 'http://localhost:3001',
  },
];

const INTERVAL = Number(process.env.INTERVAL_MS) || 5000;

const last = {};

async function check(target) {
  const start = Date.now();

  try {
    const response = await fetch(`${target.url}/health`, {
      signal: AbortSignal.timeout(2000),
    });

    return {
      up: response.ok,
      ms: Date.now() - start,
    };
  } catch {
    return {
      up: false,
      ms: Date.now() - start,
    };
  }
}

async function tick() {
  const results = await Promise.all(TARGETS.map(check));

  console.log(
    new Date().toISOString().slice(11, 19),
    TARGETS.map((target, index) => {
      const result = results[index];

      return `${target.name}=${result.up ? 'UP' : 'DOWN'}(${result.ms}ms)`;
    }).join('  ')
  );

  TARGETS.forEach((target, index) => {
    const up = results[index].up;

    if (last[target.name] === true && !up) {
      console.log(`ALERT: ${target.name} DOWN`);
    }

    if (last[target.name] === false && up) {
      console.log(`RECOVERED: ${target.name}`);
    }

    last[target.name] = up;
  });
}

tick();
setInterval(tick, INTERVAL);
