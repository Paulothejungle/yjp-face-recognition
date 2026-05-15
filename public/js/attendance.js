// ============================================================
// ATTENDANCE.JS — Logic absensi: GPS + Face + API
// ============================================================

if (!Auth.requireAuth()) throw new Error('Not authenticated');
document.getElementById('navbar-container').innerHTML = renderNavbar('absensi');

const videoEl = document.getElementById('video');
const canvasEl = document.getElementById('overlay-canvas');
const loadingSection = document.getElementById('loading-section');
const cameraSection = document.getElementById('camera-section');
const btnStart = document.getElementById('btn-start-camera');
const btnStop = document.getElementById('btn-stop-camera');

let isProcessing = false;
let myAttendance = null;
let settings = null;

// ── Clock
const clockEl = document.getElementById('clock');
const dateEl = document.getElementById('date-display');
setInterval(() => {
  const now = new Date();
  if (clockEl) clockEl.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (dateEl) dateEl.textContent = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}, 1000);

// ── Load settings & status
async function loadStatusAndSettings() {
  try {
    settings = await Auth.apiCall('GET', '/api/settings');
    const radiusInfo = document.getElementById('radius-info');
    if (radiusInfo) radiusInfo.textContent = settings.radius_meters;

    const todayData = await Auth.apiCall('GET', '/api/attendance/me?date=' + new Date().toISOString().split('T')[0]);
    myAttendance = todayData[0] || null;
    updateStatusDisplay();
  } catch (e) {}
}

function updateStatusDisplay() {
  const masukEl = document.getElementById('status-masuk');
  const keluarEl = document.getElementById('status-keluar');
  if (masukEl) masukEl.textContent = myAttendance?.check_in
    ? new Date(myAttendance.check_in).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})
    : 'Belum absen';
  if (keluarEl) keluarEl.textContent = myAttendance?.check_out
    ? new Date(myAttendance.check_out).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})
    : 'Belum absen';
}

// ── Get GPS location
function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Browser tidak mendukung GPS'));
    const lokEl = document.getElementById('status-lokasi');
    if (lokEl) lokEl.textContent = 'Mengambil lokasi...';
    navigator.geolocation.getCurrentPosition(
      pos => {
        if (lokEl) lokEl.textContent = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      err => {
        if (lokEl) lokEl.textContent = 'Lokasi tidak tersedia';
        reject(new Error('Izin lokasi ditolak. Harap aktifkan GPS.'));
      },
      { timeout: 10000, maximumAge: 30000 }
    );
  });
}

// ── Show result overlay
function showOverlay(type, icon, title, msg) {
  const overlay = document.getElementById('status-overlay');
  document.getElementById('overlay-icon').textContent = icon;
  document.getElementById('overlay-title').textContent = title;
  document.getElementById('overlay-msg').textContent = msg;
  overlay.classList.remove('hidden');
  overlay.style.background = type === 'success'
    ? 'rgba(0,20,0,0.92)'
    : 'rgba(30,0,0,0.92)';
  if (type === 'success') {
    setTimeout(() => {
      overlay.classList.add('hidden');
      // Kamera biarkan mati setelah sukses, user harus klik Mulai Kamera manual jika ingin mengulang.
      document.getElementById('camera-section').classList.add('hidden');
      document.getElementById('btn-start-camera').classList.remove('hidden');
      document.getElementById('btn-stop-camera').classList.add('hidden');
    }, 4000);
  }
}

window.closeErrorOverlay = function() {
  document.getElementById('status-overlay').classList.add('hidden');
  restartCamera();
};

// ── Handle face match
async function handleDetected(match) {
  if (isProcessing) return;
  isProcessing = true;
  FaceRec.stopVideo();

  try {
    // Ambil lokasi GPS
    let loc;
    try {
      loc = await getLocation();
    } catch (locErr) {
      showOverlay('error', '📍', 'Lokasi Diperlukan', locErr.message);
      restartCamera();
      return;
    }

    // Tentukan action: checkin atau checkout
    const today = new Date().toISOString().split('T')[0];
    const existing = await Auth.apiCall('GET', `/api/attendance/me?date=${today}`);
    const rec = existing[0];

    // Jika sudah absen masuk dan keluar, hentikan proses (jangan hit API lagi)
    if (rec && rec.check_in && rec.check_out) {
      showOverlay('success', '🎉', 'Absen Selesai', 'Anda sudah menyelesaikan absensi masuk dan keluar untuk hari ini.');
      isProcessing = false;
      return;
    }

    const action = (!rec || !rec.check_in) ? 'checkin' : 'checkout';

    // Kirim ke API
    const result = await Auth.apiCall('POST', `/api/attendance/${action}`, {
      employee_id: match.id,
      lat: loc.lat,
      lng: loc.lng
    });

    myAttendance = result.data;
    updateStatusDisplay();

    const actionLabel = action === 'checkin' ? 'Absen Masuk' : 'Absen Keluar';
    showOverlay('success', '✅', `${actionLabel} Berhasil!`, `${match.name} — ${result.message}`);
    showToast('success', actionLabel, result.message);
  } catch (err) {
    showOverlay('error', '❌', 'Absen Ditolak', err.message);
    showToast('error', 'Absen Ditolak', err.message);
    // User harus klik "Tutup/Coba Lagi" untuk merestart kamera
  } finally {
    isProcessing = false;
  }
}

function restartCamera() {
  // Tidak perlu delay 3 detik lagi karena user memicunya manual lewat tombol Tutup
  FaceRec.startVideo(videoEl).then(() => {
    videoEl.addEventListener('play', startDetection, { once: true });
  }).catch(e => console.log(e));
}

function startDetection() {
  FaceRec.detectLoop(videoEl, canvasEl, handleDetected);
}

// ── Init
async function init() {
  const progressEl = document.getElementById('model-progress');
  try {
    // 1. Load model
    await FaceRec.loadModels(p => { if (progressEl) progressEl.style.width = p + '%'; });

    // 2. Load karyawan & descriptor
    const count = await FaceRec.loadEmployees();

    // 3. Load status & settings
    await loadStatusAndSettings();

    // 4. Tampilkan kamera
    loadingSection.classList.add('hidden');
    cameraSection.classList.remove('hidden');
    btnStop.classList.remove('hidden');

    // 5. Start kamera
    await FaceRec.startVideo(videoEl);
    videoEl.addEventListener('play', startDetection, { once: true });

    if (count === 0) {
      showToast('warning', 'Tidak ada data wajah', 'Belum ada karyawan yang mendaftarkan wajah. Hubungi admin.');
    }
  } catch (err) {
    loadingSection.innerHTML = `
      <div style="font-size:40px;margin-bottom:16px;">❌</div>
      <p style="font-weight:600;color:var(--danger);">Gagal Memuat</p>
      <p class="text-sm text-muted" style="margin-top:8px;">${err.message}</p>
      <button onclick="location.reload()" class="btn btn-primary btn-sm" style="margin-top:16px;">Coba Lagi</button>
    `;
  }
}

btnStop.addEventListener('click', () => {
  FaceRec.stopVideo();
  cameraSection.classList.add('hidden');
  btnStart.classList.remove('hidden');
  btnStop.classList.add('hidden');
});

btnStart.addEventListener('click', async () => {
  cameraSection.classList.remove('hidden');
  btnStart.classList.add('hidden');
  btnStop.classList.remove('hidden');
  await FaceRec.startVideo(videoEl);
  videoEl.addEventListener('play', startDetection, { once: true });
});

init();
