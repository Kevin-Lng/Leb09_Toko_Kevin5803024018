
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { rateLimit } = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const crypto = require('crypto');

const app = express();

app.set('trust proxy', 1);

// Request ID untuk melacak permintaan
app.use((req, res, next) => {
  req.headers['x-request-id'] =
    req.headers['x-request-id'] || crypto.randomUUID();

  res.setHeader('X-Request-Id', req.headers['x-request-id']);

  next();
});

// Health Check API Gateway
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'gateway',
  });
});

// ============================================
// KONFIGURASI SERVICE
// ============================================

const PORT = Number(process.env.PORT) || 8080;

const PRODUCT_SERVICE_URL = (
  process.env.PRODUCT_SERVICE_URL || 'http://localhost:3000'
).replace(/\/$/, '');

const ORDER_SERVICE_URL = (
  process.env.ORDER_SERVICE_URL || 'http://localhost:3001'
).replace(/\/$/, '');

const PRODUCT_DOC_URL =
  process.env.PRODUCT_DOC_URL ||
  `${PRODUCT_SERVICE_URL}/openapi.json`;

const ORDER_DOC_URL =
  process.env.ORDER_DOC_URL ||
  `${ORDER_SERVICE_URL}/openapi.json`;

// ============================================
// FUNGSI MENGUBAH REFERENSI SCHEMA
// ============================================

function prefixSchemaRefs(value, schemaPrefix) {
  if (Array.isArray(value)) {
    return value.map((item) =>
      prefixSchemaRefs(item, schemaPrefix)
    );
  }

  if (value !== null && typeof value === 'object') {
    const result = {};

    for (const [key, item] of Object.entries(value)) {
      if (
        key === '$ref' &&
        typeof item === 'string' &&
        item.startsWith('#/components/schemas/')
      ) {
        const schemaName = item.slice(
          '#/components/schemas/'.length
        );

        result[key] =
          `#/components/schemas/${schemaPrefix}_${schemaName}`;
      } else {
        result[key] = prefixSchemaRefs(item, schemaPrefix);
      }
    }

    return result;
  }

  return value;
}

// ============================================
// MENGAMBIL DOKUMENTASI DARI SETIAP SERVICE
// ============================================

async function fetchServiceSpec(url, serviceName) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `${serviceName} mengembalikan HTTP ${response.status}`
    );
  }

  const spec = await response.json();

  if (!spec.paths || typeof spec.paths !== 'object') {
    throw new Error(
      `Dokumentasi ${serviceName} tidak memiliki paths yang valid.`
    );
  }

  return spec;
}

// ============================================
// MENGGABUNGKAN OPENAPI PRODUCT DAN ORDER
// ============================================

function mergeServiceSpec(
  target,
  source,
  pathPrefix,
  schemaPrefix
) {
  // Menggabungkan schemas
  const schemas = source.components?.schemas || {};

  for (const [schemaName, schema] of Object.entries(schemas)) {
    const newSchemaName = `${schemaPrefix}_${schemaName}`;

    target.components.schemas[newSchemaName] =
      prefixSchemaRefs(schema, schemaPrefix);
  }

  // Menggabungkan paths dengan prefix gateway
  for (const [path, pathItem] of Object.entries(source.paths)) {
    const newPath = `${pathPrefix}${path}`;

    target.paths[newPath] =
      prefixSchemaRefs(pathItem, schemaPrefix);
  }
}

// ============================================
// MEMBUAT DOKUMENTASI OPENAPI GABUNGAN
// ============================================

async function buildMergedOpenAPI() {
  const [productSpec, orderSpec] = await Promise.all([
    fetchServiceSpec(PRODUCT_DOC_URL, 'Product Service'),
    fetchServiceSpec(ORDER_DOC_URL, 'Order Service'),
  ]);

  const mergedSpec = {
    openapi: '3.0.3',

    info: {
      title: 'Toko Microservices API',
      version: '1.0.0',
      description:
        'Dokumentasi gabungan API Product Service dan Order Service melalui API Gateway.',
    },

    servers: [
      {
        url: '/',
        description: 'API Gateway',
      },
    ],

    tags: [
      {
        name: 'Products',
        description: 'API pengelolaan produk dan reservasi stok',
      },
      {
        name: 'Orders',
        description: 'API pengelolaan pesanan',
      },
    ],

    paths: {},

    components: {
      schemas: {},
    },
  };

  // Product Service
  mergeServiceSpec(
    mergedSpec,
    productSpec,
    '/product-service',
    'ProductService'
  );

  // Order Service
  mergeServiceSpec(
    mergedSpec,
    orderSpec,
    '/order-service',
    'OrderService'
  );

  return mergedSpec;
}

// ============================================
// ENDPOINT OPENAPI GABUNGAN
// ============================================

app.get('/openapi.json', async (req, res) => {
  try {
    const mergedSpec = await buildMergedOpenAPI();

    res.json(mergedSpec);
  } catch (error) {
    console.error(
      'Gagal menggabungkan dokumentasi OpenAPI:',
      error.message
    );

    res.status(503).json({
      message: 'Dokumentasi OpenAPI tidak dapat digabungkan.',
      details: error.message,
    });
  }
});

// ============================================
// SWAGGER UI
// ============================================

app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(null, {
    swaggerOptions: {
      url: '/openapi.json',
    },
  })
);

// ============================================
// RATE LIMITING
// ============================================

app.use(
  rateLimit({
    windowMs: 10 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message:
      'Too Many Requests - Kamu di-block sementara karena spam!',
  })
);

// ============================================
// ERROR HANDLER PROXY
// ============================================

const handleProxyError = (error, req, res) => {
  console.error(
    `Gateway proxy error for ${req.originalUrl}:`,
    error.message
  );

  if (!res.headersSent) {
    res.status(502).json({
      message: 'Service tujuan tidak tersedia melalui gateway.',
    });
  }
};

// ============================================
// PROXY PRODUCT SERVICE
// ============================================

app.use(
  '/product-service',
  createProxyMiddleware({
    target: PRODUCT_SERVICE_URL,
    changeOrigin: true,
    on: {
      error: handleProxyError,
    },
  })
);

// ============================================
// PROXY ORDER SERVICE
// ============================================

app.use(
  '/order-service',
  createProxyMiddleware({
    target: ORDER_SERVICE_URL,
    changeOrigin: true,
    on: {
      error: handleProxyError,
    },
  })
);

// ============================================
// MENJALANKAN API GATEWAY
// ============================================

app.listen(PORT, () => {
  console.log(
    `API Gateway beroperasi di http://localhost:${PORT}`
  );

  console.log(
    `Swagger UI tersedia di http://localhost:${PORT}/docs`
  );
});
