const amqp = require('amqplib');

const AMQP_URL = process.env.AMQP_URL || 'amqp://localhost';
const queueName = process.argv.slice(2).find((arg) => arg !== '--crash') || 'notification-queue';
const crashBeforeAck = process.argv.includes('--crash');
const processed = new Set();

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const getErrorMessage = (error) => (error instanceof Error && error.message ? error.message : String(error));

async function startConsumer() {
  const connection = await amqp.connect(AMQP_URL);
  const channel = await connection.createChannel();

  await channel.assertExchange('orders', 'fanout', { durable: true });
  await channel.assertQueue(queueName, { durable: true });
  await channel.bindQueue(queueName, 'orders', '');
  await channel.prefetch(1);

  console.log(`Notification Service mendengarkan queue "${queueName}".`);

  await channel.consume(queueName, async (msg) => {
    if (!msg) {
      return;
    }

    const messageId = msg.properties.messageId;
    let event;
    try {
      event = JSON.parse(msg.content.toString());
    } catch (error) {
      console.error('Pesan JSON rusak; pesan ditolak tanpa requeue:', getErrorMessage(error));
      channel.nack(msg, false, false);
      return;
    }

    if (messageId && processed.has(messageId)) {
      console.log(`Pesan duplikat ${messageId} dilewati.`);
      channel.ack(msg);
      return;
    }

    try {
      const { id, productName, qty } = event.data;
      await delay(1000);
      console.log(`[email] email terkirim: pesanan #${id} ${productName} x${qty}`);

      if (crashBeforeAck) {
        console.log('crash sebelum ack!');
        process.exit(1);
      }

      if (messageId) {
        processed.add(messageId);
      }
      channel.ack(msg);
    } catch (error) {
      console.error('Pemrosesan pesan gagal; pesan akan dikirim ulang:', getErrorMessage(error));
      channel.nack(msg, false, true);
    }
  });

  connection.on('error', (error) => {
    console.error('RabbitMQ connection error:', getErrorMessage(error));
  });
  connection.on('close', () => {
    console.error('Koneksi RabbitMQ ditutup.');
    process.exitCode = 1;
  });
}

startConsumer().catch((error) => {
  console.error('Notification Service gagal terhubung ke RabbitMQ:', getErrorMessage(error));
  process.exitCode = 1;
});
