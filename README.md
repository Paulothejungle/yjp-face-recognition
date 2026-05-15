# Sistem Absensi Face Recognition
## PT. Yudanta Jaya Putra

Sistem absensi berbasis pengenalan wajah (face recognition) dengan PWA support, geolokasi real-time, dan laporan PDF/Excel.

---

## 🚀 Cara Setup (Langkah demi Langkah)

### 1. Install Node.js
Download dan install Node.js dari: https://nodejs.org (pilih versi LTS)

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Supabase
1. Buat akun di https://supabase.com
2. Buat project baru
3. Masuk ke **SQL Editor** → paste isi file `supabase_setup.sql` → klik **Run**
4. Masuk ke **Settings → API** → salin **URL** dan **anon key** dan **service_role key**

### 4. Konfigurasi `.env`
Edit file `.env`:
```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
PORT=3000
```

### 5. Buat User Admin di Supabase
1. Masuk ke **Supabase Dashboard → Authentication → Users**
2. Klik **Add user** → isi email: `admin@yjp.com` dan password
3. Setelah user terbuat, masuk ke **Table Editor → profiles**
4. Set `role = 'admin'` untuk user tersebut

### 6. Download Model Face Recognition
```bash
bash download-models.sh
```

### 7. Jalankan Server
```bash
npm run dev
```

Buka browser: **http://localhost:3000**

---

## 📱 Install sebagai PWA di HP
1. Buka http://[IP-server]:3000 di HP (pastikan HP dan komputer satu WiFi)
2. Di Chrome Android: ketuk menu **⋮ → Tambahkan ke layar utama**
3. Di iOS Safari: ketuk **Share → Add to Home Screen**

---

## 🔑 Role & Akses
| Role | Login | Akses |
|---|---|---|
| **Admin** | `admin@yjp.com` | Dashboard, Admin Panel, Laporan, Pengaturan |
| **Karyawan** | `nama@yjp.com` | Halaman Absensi + Riwayat Pribadi |

---

## 📂 Struktur Folder
```
project-absensi-muka/
├── public/           # Frontend (HTML, CSS, JS)
├── server/           # Backend Node.js
├── supabase_setup.sql # Script database
├── download-models.sh # Download AI models
└── .env              # Konfigurasi (jangan di-commit!)
```

---

## 🛟 Troubleshooting
- **Kamera tidak muncul**: Pastikan akses kamera diizinkan di browser
- **Wajah tidak terdeteksi**: Pastikan model sudah didownload (`bash download-models.sh`)
- **Absen ditolak (lokasi)**: Sesuaikan radius di Admin Panel → Pengaturan
- **Koneksi Supabase gagal**: Periksa URL dan key di file `.env`
