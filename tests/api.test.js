
const { test } = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.BASE_URL || 'http://localhost:8080';

const json = {
  'Content-Type': 'application/json',
};

const get = (path) => fetch(`${BASE}${path}`);

const post = (path, body) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify(body),
  });

let createdOrder;

// ============================================
// TEST 1: GET ALL PRODUCTS
// ============================================

test('GET /products mengembalikan daftar produk dengan bentuk yang benar', async () => {
  const res = await get('/product-service/products');

  assert.equal(res.status, 200);

  const list = await res.json();

  assert.ok(Array.isArray(list));
  assert.ok(list.length > 0);

  for (const product of list) {
    assert.equal(typeof product.id, 'number');
    assert.equal(typeof product.name, 'string');
    assert.equal(typeof product.price, 'number');
    assert.equal(typeof product.stock, 'number');
  }
});

// ============================================
// TEST 2: GET PRODUCT BY ID
// ============================================

test('GET /products/:id mengembalikan detail satu produk', async () => {
  const res = await get('/product-service/products/1');

  assert.equal(res.status, 200);

  const product = await res.json();

  assert.equal(product.id, 1);
  assert.equal(typeof product.name, 'string');
  assert.equal(typeof product.price, 'number');
  assert.equal(typeof product.stock, 'number');
});

// ============================================
// TEST 3: GET UNKNOWN PRODUCT
// ============================================

test('GET /products/:id untuk ID tidak dikenal mengembalikan 404', async () => {
  const res = await get('/product-service/products/9999');

  assert.equal(res.status, 404);

  const body = await res.json();

  assert.equal(body.message, 'Produk tidak ditemukan.');
});

// ============================================
// TEST 4: CREATE ORDER AND CHECK STOCK
// ============================================

test('POST /orders berhasil (201) dan mengurangi stok produk', async () => {
  const beforeResponse = await get('/product-service/products/2');

  assert.equal(beforeResponse.status, 200);

  const before = await beforeResponse.json();

  const res = await post('/order-service/orders', {
    productId: 2,
    qty: 1,
  });

  assert.equal(res.status, 201);

  const responseBody = await res.json();

  createdOrder = responseBody.order;

  assert.ok(createdOrder);

  assert.equal(createdOrder.productId, 2);
  assert.equal(createdOrder.qty, 1);
  assert.equal(createdOrder.unitPrice, before.price);
  assert.equal(createdOrder.total, before.price);
  assert.equal(typeof createdOrder.id, 'number');

  const afterResponse = await get('/product-service/products/2');

  assert.equal(afterResponse.status, 200);

  const after = await afterResponse.json();

  assert.equal(after.stock, before.stock - 1);
});

// ============================================
// TEST 5: INSUFFICIENT STOCK
// ============================================

test('POST /orders dengan jumlah melebihi stok mengembalikan 409', async () => {
  const res = await post('/order-service/orders', {
    productId: 2,
    qty: 100000,
  });

  assert.equal(res.status, 409);

  const body = await res.json();

  assert.equal(body.message, 'Stok produk tidak mencukupi.');
});

// ============================================
// TEST 6: INVALID ORDER INPUT
// ============================================

test('POST /orders dengan input tidak valid mengembalikan 400', async () => {
  const invalidQtyZero = await post('/order-service/orders', {
    productId: 2,
    qty: 0,
  });

  assert.equal(invalidQtyZero.status, 400);

  const invalidQtyText = await post('/order-service/orders', {
    productId: 2,
    qty: 'abc',
  });

  assert.equal(invalidQtyText.status, 400);
});

// ============================================
// TEST 7: UNKNOWN PRODUCT
// ============================================

test('POST /orders untuk produk tidak dikenal mengembalikan 404', async () => {
  const res = await post('/order-service/orders', {
    productId: 9999,
    qty: 1,
  });

  assert.equal(res.status, 404);

  const body = await res.json();

  assert.equal(body.message, 'Produk tidak ditemukan.');
});

// ============================================
// TEST 8: GET ORDERS
// ============================================

test('GET /orders memuat pesanan yang baru dibuat', async () => {
  assert.ok(createdOrder);

  const res = await get('/order-service/orders');

  assert.equal(res.status, 200);

  const list = await res.json();

  assert.ok(Array.isArray(list));

  assert.ok(
    list.some((order) => order.id === createdOrder.id)
  );
});

// ============================================
// TEST 9: PRODUCT SERVICE HEALTH CHECK
// ============================================

test('GET /product-service/health mengembalikan status ok', async () => {
  const res = await get('/product-service/health');

  assert.equal(res.status, 200);

  const body = await res.json();

  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'product-service');
});

// ============================================
// TEST 10: ORDER RESPONSE REQUEST ID
// ============================================

test('POST /orders mengembalikan header X-Request-Id', async () => {
  const res = await post('/order-service/orders', {
    productId: 3,
    qty: 1,
  });

  assert.equal(res.status, 201);

  const requestId = res.headers.get('x-request-id');

  assert.ok(
    requestId,
    'Respons harus memiliki header X-Request-Id'
  );

  assert.match(
    requestId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  );

  const body = await res.json();

  assert.ok(body.order);
  assert.equal(body.order.productId, 3);
});
