const assert = require('node:assert/strict');

const gatewayUrl = 'http://localhost:8080';

async function main() {
  const productListResponse = await fetch(`${gatewayUrl}/product-service/products`);
  assert.equal(productListResponse.status, 200, 'Daftar produk harus berhasil diambil.');

  const products = await productListResponse.json();
  assert.equal(products.length, 3, 'Harus tersedia tiga produk awal.');
  assert.equal(products[0].stock, 10, 'Stok awal produk pertama harus 10.');
  console.log(`Daftar produk: HTTP ${productListResponse.status}, ${products.length} produk.`);

  const orderResponse = await fetch(`${gatewayUrl}/order-service/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId: 1, qty: 2 }),
  });
  assert.equal(orderResponse.status, 201, 'Pembuatan pesanan harus menghasilkan HTTP 201.');
  const orderResult = await orderResponse.json();
  assert.equal(orderResult.order.productName, products[0].name, 'Nama produk harus disalin ke pesanan.');
  assert.equal(orderResult.order.unitPrice, products[0].price, 'Harga produk harus disalin ke pesanan.');
  console.log(`Pembuatan pesanan: HTTP ${orderResponse.status}.`);

  const productResponse = await fetch(`${gatewayUrl}/product-service/products/1`);
  assert.equal(productResponse.status, 200, 'Detail produk harus berhasil diambil.');

  const product = await productResponse.json();
  assert.equal(product.stock, 8, 'Stok produk pertama harus berkurang menjadi 8.');
  console.log(`Stok produk pertama setelah pemesanan: ${product.stock}.`);
  console.log('Smoke test berhasil.');
}

main().catch((error) => {
  console.error('Smoke test gagal:', error.message);
  process.exitCode = 1;
});
