
const express = require('express');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();

app.use(express.json());

// Data produk
const products = [
  {
    id: 1,
    name: 'Produk 1',
    price: 10000,
    stock: 10,
    category: 'Periferal',
  },
  {
    id: 2,
    name: 'Produk 2',
    price: 15000,
    stock: 20,
    category: 'Periferal',
  },
  {
    id: 3,
    name: 'Produk 3',
    price: 20000,
    stock: 15,
    category: 'Periferal',
  },
];

// Konfigurasi Swagger
const swaggerOptions = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Product Service API',
      version: '1.0.0',
      description: 'Dokumentasi API untuk pengelolaan produk dan reservasi stok.',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Product Service lokal',
      },
    ],
    components: {
      schemas: {
        Product: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 1,
            },
            name: {
              type: 'string',
              example: 'Produk 1',
            },
            price: {
              type: 'integer',
              example: 10000,
            },
            stock: {
              type: 'integer',
              example: 10,
            },
            category: {
              type: 'string',
              example: 'Periferal',
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Produk tidak ditemukan.',
            },
          },
        },
        ReservationResponse: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Stok berhasil direservasi.',
            },
            product: {
              $ref: '#/components/schemas/Product',
            },
            qty: {
              type: 'integer',
              example: 2,
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
 *   name: Products
 *   description: API pengelolaan produk
 */

/**
 * @swagger
 * /products:
 *   get:
 *     summary: Mendapatkan seluruh produk
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Daftar produk berhasil diperoleh
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Product'
 *             example:
 *               - id: 1
 *                 name: Produk 1
 *                 price: 10000
 *                 stock: 10
 *                 category: Periferal
 */
app.get('/products', (req, res) => {
  res.json(products);
});

/**
 * @swagger
 * /products/{id}:
 *   get:
 *     summary: Mendapatkan detail produk berdasarkan ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID produk
 *     responses:
 *       200:
 *         description: Detail produk berhasil diperoleh
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
 *             example:
 *               id: 1
 *               name: Produk 1
 *               price: 10000
 *               stock: 10
 *               category: Periferal
 *       404:
 *         description: Produk tidak ditemukan
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Produk tidak ditemukan.
 */
app.get('/products/:id', (req, res) => {
  const product = products.find(
    (item) => item.id === Number(req.params.id)
  );

  if (!product) {
    return res.status(404).json({
      message: 'Produk tidak ditemukan.',
    });
  }

  res.json(product);
});

/**
 * @swagger
 * /products/{id}/reserve:
 *   post:
 *     summary: Melakukan reservasi stok produk
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID produk
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - qty
 *             properties:
 *               qty:
 *                 type: integer
 *                 minimum: 1
 *                 example: 2
 *     responses:
 *       200:
 *         description: Stok berhasil direservasi
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReservationResponse'
 *             example:
 *               message: Stok berhasil direservasi.
 *               product:
 *                 id: 1
 *                 name: Produk 1
 *                 price: 10000
 *                 stock: 8
 *                 category: Periferal
 *               qty: 2
 *       400:
 *         description: Jumlah reservasi tidak valid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: qty harus berupa bilangan bulat positif.
 *       404:
 *         description: Produk tidak ditemukan
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Produk tidak ditemukan.
 *       409:
 *         description: Stok produk tidak mencukupi
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               message: Stok produk tidak mencukupi.
 */
app.post('/products/:id/reserve', (req, res) => {
  const { qty } = req.body;

  if (!Number.isInteger(qty) || qty <= 0) {
    return res.status(400).json({
      message: 'qty harus berupa bilangan bulat positif.',
    });
  }

  const product = products.find(
    (item) => item.id === Number(req.params.id)
  );

  if (!product) {
    return res.status(404).json({
      message: 'Produk tidak ditemukan.',
    });
  }

  if (product.stock < qty) {
    return res.status(409).json({
      message: 'Stok produk tidak mencukupi.',
    });
  }

  product.stock -= qty;

  res.json({
    message: 'Stok berhasil direservasi.',
    product: { ...product },
    qty,
  });
});

// Menjalankan Product Service
app.listen(3000, () => {
  console.log('Product Service jalan di port 3000');
});
