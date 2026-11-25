
const fs = require('node:fs');
const amqp = require('amqplib');

// ============================================
// KONFIGURASI
// ============================================

const AMQP_URL = process.env.AMQP_URL || 'amqp://localhost';

const queueName =
  process.argv.slice(2).find((arg) => arg !== '--crash') ||
  'notification-queue';

const crashBeforeAck = process.argv.includes('--crash');

const processed = new Set();

const READY_FILE = '/tmp/notification-ready';

// ============================================
// HELPER
// ============================================

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const getErrorMessage = (error) =>
  error instanceof Error && error.message
    ? error.message
    : String(error);

// Menghapus readiness marker
function clearReadyFile() {
  try {
    fs.unlinkSync(READY_FILE);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(
        'Gagal menghapus readiness marker:',
        getErrorMessage(error)
      );
    }
  }
}

// Menghapus marker lama ketika container dimulai ulang
clearReadyFile();

// ============================================
// RABBITMQ CONSUMER
// ============================================

async function startConsumer() {
  const connection = await amqp.connect(AMQP_URL);
  const channel = await connection.createChannel();

  // Event handler koneksi RabbitMQ
  connection.on('error', (error) => {
    console.error(
      'RabbitMQ connection error:',
      getErrorMessage(error)
    );
  });

  connection.on('close', () => {
    clearReadyFile();

    console.error('Koneksi RabbitMQ ditutup.');
    process.exitCode = 1;
  });

  // ============================================
  // PERSIAPAN EXCHANGE DAN QUEUE
  // ============================================

  await channel.assertExchange('orders', 'fanout', {
    durable: true,
  });

  await channel.assertQueue(queueName, {
    durable: true,
  });

  await channel.bindQueue(queueName, 'orders', '');

  // Hanya memproses satu pesan pada satu waktu
  await channel.prefetch(1);

  console.log(
    `Notification Service mendengarkan queue "${queueName}".`
  );

  // ============================================
  // MENERIMA PESAN DARI RABBITMQ
  // ============================================

  await channel.consume(queueName, async (msg) => {
    if (!msg) {
      return;
    }

    const messageId = msg.properties.messageId;
    let event;

    // Memeriksa format JSON pesan
    try {
      event = JSON.parse(msg.content.toString());
    } catch (error) {
      console.error(
        'Pesan JSON rusak; pesan ditolak tanpa requeue:',
        getErrorMessage(error)
      );

      channel.nack(msg, false, false);
      return;
    }

    // Memeriksa pesan duplikat
    if (messageId && processed.has(messageId)) {
      console.log(`Pesan duplikat ${messageId} dilewati.`);

      channel.ack(msg);
      return;
    }

    try {
      const { id, productName, qty } = event.data;

      // Simulasi pengiriman notifikasi
      await delay(1000);

      console.log(
        `[email] email terkirim: pesanan #${id} ${productName} x${qty}`
      );

      // Simulasi consumer crash sebelum ACK
      if (crashBeforeAck) {
        console.log('crash sebelum ack!');

        clearReadyFile();

        process.exit(1);
      }

      // Mencatat pesan yang telah diproses
      if (messageId) {
        processed.add(messageId);
      }

      // Mengirim ACK kepada RabbitMQ
      channel.ack(msg);

    } catch (error) {
      console.error(
        'Pemrosesan pesan gagal; pesan akan dikirim ulang:',
        getErrorMessage(error)
      );

      // NACK dengan requeue agar pesan dapat diproses ulang
      channel.nack(msg, false, true);
    }
  });

  // ============================================
  // DOCKER READINESS CHECK
  // ============================================

  // File dibuat hanya setelah consumer berhasil terdaftar
  fs.writeFileSync(READY_FILE, 'ready');

  console.log(
    'Notification Service siap menerima pesan.'
  );
}

// ============================================
// MENJALANKAN CONSUMER
// ============================================

startConsumer().catch((error) => {
  clearReadyFile();

  console.error(
    'Notification Service gagal terhubung ke RabbitMQ:',
    getErrorMessage(error)
  );

  process.exitCode = 1;
});
