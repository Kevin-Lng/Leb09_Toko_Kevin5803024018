(async () => {
  console.log("Mulai menembak API Gateway 30 kali...\n");
  for (let i = 1; i <= 30; i++) {
    const res = await fetch('http://localhost:8080/product-service/products');
    console.log(`Request ke-${i}: Status ${res.status}`);
  }
})();
