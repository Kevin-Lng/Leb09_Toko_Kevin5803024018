const express = require('express');
const app = express();

app.use(express.json());

const products = [
  { id: 1, name: 'Produk 1', price: 10000, stock: 10 },
  { id: 2, name: 'Produk 2', price: 15000, stock: 20 },
  { id: 3, name: 'Produk 3', price: 20000, stock: 15 },
];

app.get('/products', (req, res) => {
  res.json(products);
});

app.get('/products/:id', (req, res) => {
  const product = products.find((item) => item.id === Number(req.params.id));
  if (!product) {
    return res.status(404).json({ message: 'Produk tidak ditemukan.' });
  }

  res.json(product);
});

app.post('/products/:id/reserve', (req, res) => {
  const { qty } = req.body;
  if (!Number.isInteger(qty) || qty <= 0) {
    return res.status(400).json({ message: 'qty harus berupa bilangan bulat positif.' });
  }

  const product = products.find((item) => item.id === Number(req.params.id));
  if (!product) {
    return res.status(404).json({ message: 'Produk tidak ditemukan.' });
  }
  if (product.stock < qty) {
    return res.status(409).json({ message: 'Stok produk tidak mencukupi.' });
  }

  product.stock -= qty;
  res.json({
    message: 'Stok berhasil direservasi.',
    product: { ...product },
    qty,
  });
});

app.listen(3000, () => console.log('Product Service jalan di port 3000'));