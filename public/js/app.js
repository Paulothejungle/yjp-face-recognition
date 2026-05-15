// Daftarkan Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SW terdaftar:', reg.scope))
      .catch(err => console.log('SW gagal:', err));
  });
}
