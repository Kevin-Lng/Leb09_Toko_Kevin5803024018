const express = require('express');
const amqp = require('amqplib');
const app = express();

app.use(express.json());

const productServiceUrl = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3000';
const AMQP_URL = process.env.AMQP_URL || 'amqp://localhost';
const orders = [];
let nextOrderId = 1;
let channel;
let reconnectTimer;
let connecting = false;

function getErrorMessage(error) {
  return error instanceof Error && error.message ? error.message : String(error);
}

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
      console.error('RabbitMQ connection error:', getErrorMessage(error));
    });
    connection.on('close', () => {
      if (channel === queueChannel) {
        channel = undefined;
        console.warn('Koneksi RabbitMQ ditutup; mencoba kembali dalam 3 detik.');
        scheduleReconnect();
      }
    });

    queueChannel = await connection.createChannel();
    await queueChannel.assertExchange('orders', 'fanout', { durable: true });
    queueChannel.on('error', (error) => {
      console.error('RabbitMQ channel error:', getErrorMessage(error));
    });
    queueChannel.on('close', () => {
      if (channel === queueChannel) {
        channel = undefined;
        console.warn('Channel RabbitMQ ditutup; mencoba kembali dalam 3 detik.');
        scheduleReconnect();
      }
    });

    channel = queueChannel;
    console.log('Terhubung ke RabbitMQ; exchange orders siap.');
  } catch (error) {
    console.warn(`RabbitMQ belum tersedia (${getErrorMessage(error)}); mencoba kembali dalam 3 detik.`);
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        console.error('Gagal menutup koneksi RabbitMQ yang tidak siap:', getErrorMessage(closeError));
      }
    }
    scheduleReconnect();
  } finally {
    connecting = false;
  }
}

function publishOrderCreated(order) {
  if (!channel) {
    console.warn(`Event order.created tidak terkirim untuk pesanan #${order.id}: channel RabbitMQ belum tersedia.`);
    return;
  }

  const payload = {
    type: 'order.created',
    data: order,
  };

  try {
    channel.publish('orders', '', Buffer.from(JSON.stringify(payload)), {
      messageId: `order-${order.id}`,
      contentType: 'application/json',
      persistent: true,
    });
  } catch (error) {
    console.warn(`Event order.created tidak terkirim untuk pesanan #${order.id}: ${getErrorMessage(error)}`);
  }
}

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
  publishOrderCreated(order);

  res.status(201).json({ message: 'Pesanan berhasil dibuat.', order });
});

app.get('/orders', (req, res) => {
  res.json(orders);
});

connectQueue();
app.listen(3001, () => console.log('Order Service jalan di port 3001'));