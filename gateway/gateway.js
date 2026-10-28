const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { rateLimit } = require('express-rate-limit');

const app = express();
app.set('trust proxy', 1);

// Aturan Rate Limit: Maksimal 20 request per 10 detik
app.use(rateLimit({
  windowMs: 10 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too Many Requests - Kamu di-block sementara karena spam!"
}));

const handleProxyError = (error, req, res) => {
  console.error(`Gateway proxy error for ${req.originalUrl}:`, error.message);
  if (!res.headersSent) {
    res.status(502).json({ message: 'Service tujuan tidak tersedia melalui gateway.' });
  }
};

app.use('/product-service', createProxyMiddleware({
  target: 'http://localhost:3000',
  changeOrigin: true,
  on: { error: handleProxyError },
}));

app.use('/order-service', createProxyMiddleware({
  target: 'http://localhost:3001',
  changeOrigin: true,
  on: { error: handleProxyError },
}));

app.listen(8080, () => console.log('API Gateway beroperasi di http://localhost:8080'));