
const crypto = require('crypto');

module.exports = function observability(app, service) {
  const stats = {
    startedAt: new Date().toISOString(),
    requests: 0,
    errors5xx: 0,
    totalMs: 0,
  };

  // Middleware untuk mencatat setiap permintaan
  app.use((req, res, next) => {
    // Health check tidak perlu memenuhi log
    if (req.path === '/health') {
      return next();
    }

    // Mengambil ID permintaan atau membuat ID baru
    const id = req.headers['x-request-id'] || crypto.randomUUID();

    req.id = id;
    res.setHeader('X-Request-Id', id);

    const t0 = process.hrtime.bigint();

    // Mencatat hasil permintaan setelah response selesai
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;

      stats.requests++;
      stats.totalMs += ms;

      if (res.statusCode >= 500) {
        stats.errors5xx++;
      }

      // Log dalam format JSON
      console.log(
        JSON.stringify({
          time: new Date().toISOString(),
          service,
          id,
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          ms: Math.round(ms),
        })
      );
    });

    next();
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service,
      uptimeSec: Math.round(process.uptime()),
    });
  });

  // Metrics
  app.get('/metrics', (req, res) => {
    res.json({
      service,
      startedAt: stats.startedAt,
      requests: stats.requests,
      errors5xx: stats.errors5xx,
      avgMs: stats.requests
        ? Math.round(stats.totalMs / stats.requests)
        : 0,
    });
  });
};
