const express = require('express');
const app = express();

app.use(express.json());

const productServiceUrl = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3000';
const orders = [];
let nextOrderId = 1;

app.post('/orders', async (req, res) => {
  const { productId, qty } = req.body;
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ message: 'productId harus berupa bilangan bulat positif.' });
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    return res.status(400).json({ message: 'qty harus berupa bilangan bulat positif.' });
  }

  let productResponse;
  try {
    productResponse = await fetch(
      `${productServiceUrl}/products/${productId}/reserve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qty }),
        signal: AbortSignal.timeout(2000),
      },
    );
  } catch (error) {
    console.error('Product Service request failed:', error.message);
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

  res.status(201).json({ message: 'Pesanan berhasil dibuat.', order });
});

app.get('/orders', (req, res) => {
  res.json(orders);
});

app.listen(3001, () => console.log('Order Service jalan di port 3001'));