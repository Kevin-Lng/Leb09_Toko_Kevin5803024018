
const express = require('express');
const amqp = require('amqplib');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();

app.use(express.json());

require('./observability')(app, 'order-service');

// Konfigurasi service
const productServiceUrl =
  process.env.PRODUCT_SERVICE_URL || 'http://localhost:3000';

const AMQP_URL =
  process.env.AMQP_URL || 'amqp://localhost';

const orders = [];
let nextOrderId = 1;
let channel;
let reconnectTimer;
let connecting = false;

// Fungsi untuk membaca pesan error
function getErrorMessage(error) {
  return error instanceof Error && error.message
    ? error.message
    : String(error);
}

// Konfigurasi Swagger
const swaggerOptions = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Order Service API',
      version: '1.0.0',
      description: 'Dokumentasi API untuk pengelolaan pesanan.',
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Order Service lokal',
      },
    ],
    components: {
      schemas: {
        CreateOrderRequest: {
          type: 'object',
          required: ['productId', 'qty'],
          properties: {
            productId: {
              type: 'integer',
              minimum: 1,
              example: 1,
            },
            qty: {
              type: 'integer',
              minimum: 1,
              example: 2,
            },
          },
        },

        Order: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 1,
            },
            productId: {
              type: 'integer',
              example: 1,
            },
            productName: {
              type: 'string',
              example: 'Produk 1',
            },
            unitPrice: {
              type: 'integer',
              example: 10000,
            },
            qty: {
              type: 'integer',
              example: 2,
            },
            total: {
              type: 'integer',
              example: 20000,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2026-11-11T10:30:00.000Z',
            },
          },
        },

        OrderCreatedResponse: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Pesanan berhasil dibuat.',
            },
            order: {
              $ref: '#/components/schemas/Order',
            },
          },
        },

        OrderErrorResponse: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Permintaan tidak valid.',
            },
          },
        },
      },
    },
  },
  apis: [__filename],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Endpoint dokumentasi OpenAPI
app.get('/openapi.json', (req, res) => {
  res.json(swaggerSpec);
});

// Endpoint Swagger UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: API pengelolaan pesanan
 */

// ==================================================
// RABBITMQ CONNECTION
// ==================================================

function scheduleReconnect() {
  if (!reconnectTimer) {
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connectQueue();
    }, 3000);
  }
}

async function connectQueue() {
  if (connecting || channel) {
    return;
  }

  connecting = true;

  let connection;
  let queueChannel;

  try {
    connection = await amqp.connect(AMQP_URL);

    connection.on('error', (error) => {
      console.error(
        'RabbitMQ connection error:',
        getErrorMessage(error)
      );
    });

    connection.on('close', () => {
      if (channel === queueChannel) {
        channel = undefined;

        console.warn(
          'Koneksi RabbitMQ ditutup; mencoba kembali dalam 3 detik.'
        );

        scheduleReconnect();
      }
    });

    queueChannel = await connection.createChannel();

    await queueChannel.assertExchange(
      'orders',
      'fanout',
      { durable: true }
    );

    queueChannel.on('error', (error) => {
      console.error(
        'RabbitMQ channel error:',
        getErrorMessage(error)
      );
    });

    queueChannel.on('close', () => {
      if (channel === queueChannel) {
        channel = undefined;

        console.warn(
          'Channel RabbitMQ ditutup; mencoba kembali dalam 3 detik.'
        );

        scheduleReconnect();
      }
    });

    channel = queueChannel;

    console.log(
      'Terhubung ke RabbitMQ; exchange orders siap.'
    );
  } catch (error) {
    console.warn(
      `RabbitMQ belum tersedia (${getErrorMessage(error)}); mencoba kembali dalam 3 detik.`
    );

    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        console.error(
          'Gagal menutup koneksi RabbitMQ yang tidak siap:',
          getErrorMessage(closeError)
        );
      }
    }

    scheduleReconnect();
  } finally {
    connecting = false;
  }
}

// ==================================================
// PUBLISH EVENT ORDER CREATED
// ==================================================

function publishOrderCreated(order) {
  if (!channel) {
    console.warn(
      `Event order.created tidak terkirim untuk pesanan #${order.id}: channel RabbitMQ belum tersedia.`
    );

    return;
  }

  const payload = {
    type: 'order.created',
    data: order,
  };

  try {
    channel.publish(
      'orders',
      '',
      Buffer.from(JSON.stringify(payload)),
      {
        messageId: `order-${order.id}`,
        contentType: 'application/json',
        persistent: true,
      }
    );
  } catch (error) {
    console.warn(
      `Event order.created tidak terkirim untuk pesanan #${order.id}: ${getErrorMessage(error)}`
    );
  }
}

// ==================================================
// CREATE ORDER
// ==================================================

/**
 * @swagger
 * /orders:
 *   post:
 *     summary: Membuat pesanan baru
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOrderRequest'
 *           example:
 *             productId: 1
 *             qty: 2
 *     responses:
 *       201:
 *         description: Pesanan berhasil dibuat
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrderCreatedResponse'
 *             example:
 *               message: Pesanan berhasil dibuat.
 *               order:
 *                 id: 1
 *                 productId: 1
 *                 productName: Produk 1
 *                 unitPrice: 10000
 *                 qty: 2
 *                 total: 20000
 *                 createdAt: '2026-11-11T10:30:00.000Z'
 *       400:
 *         description: Product ID atau jumlah pesanan tidak valid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrderErrorResponse'
 *             examples:
 *               invalidProductId:
 *                 summary: Product ID tidak valid
 *                 value:
 *                   message: productId harus berupa bilangan bulat positif.
 *               invalidQty:
 *                 summary: Jumlah pesanan tidak valid
 *                 value:
 *                   message: qty harus berupa bilangan bulat positif.
 *       404:
 *         description: Produk tidak ditemukan
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrderErrorResponse'
 *             example:
 *               message: Produk tidak ditemukan.
 *       409:
 *         description: Stok produk tidak mencukupi
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrderErrorResponse'
 *             example:
 *               message: Stok produk tidak mencukupi.
 *       503:
 *         description: Product Service tidak tersedia atau terjadi timeout
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrderErrorResponse'
 *             example:
 *               message: Product Service tidak tersedia atau permintaan reservasi melewati batas waktu.
 */
app.post('/orders', async (req, res) => {
  const { productId, qty } = req.body;

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({
      message: 'productId harus berupa bilangan bulat positif.',
    });
  }

  if (!Number.isInteger(qty) || qty <= 0) {
    return res.status(400).json({
      message: 'qty harus berupa bilangan bulat positif.',
    });
  }

  let productResponse;

  try {
    productResponse = await fetch(
      `${productServiceUrl}/products/${productId}/reserve`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': req.id,
        },
        body: JSON.stringify({ qty }),
        signal: AbortSignal.timeout(2000),
      }
    );
  } catch (error) {
    console.error(
      'Product Service request failed:',
      error.message
    );

    return res.status(503).json({
      message: 'Product Service tidak tersedia atau permintaan reservasi melewati batas waktu.',
    });
  }

  const reservation = await productResponse.json();

  if (!productResponse.ok) {
    return res.status(productResponse.status).json(reservation);
  }

  const product = reservation.product;

  const order = {
    id: nextOrderId++,
    productId,
    productName: product.name,
    unitPrice: product.price,
    qty,
    total: product.price * qty,
    createdAt: new Date().toISOString(),
  };

  orders.push(order);

  publishOrderCreated(order);

  res.status(201).json({
    message: 'Pesanan berhasil dibuat.',
    order,
  });
});

// ==================================================
// GET ALL ORDERS
// ==================================================

/**
 * @swagger
 * /orders:
 *   get:
 *     summary: Mendapatkan seluruh pesanan
 *     tags: [Orders]
 *     responses:
 *       200:
 *         description: Daftar pesanan berhasil diperoleh
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Order'
 *             example:
 *               - id: 1
 *                 productId: 1
 *                 productName: Produk 1
 *                 unitPrice: 10000
 *                 qty: 2
 *                 total: 20000
 *                 createdAt: '2026-11-11T10:30:00.000Z'
 */
app.get('/orders', (req, res) => {
  res.json(orders);
});

// ==================================================
// START SERVICE
// ==================================================

connectQueue();

app.listen(3001, () => {
  console.log('Order Service jalan di port 3001');
});
