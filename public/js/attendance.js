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
  const reloadBtn = document.getElementById('btn-reload');
  if (reloadBtn) reloadBtn.addEventListener('click', () => location.reload());

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

function closeErrorOverlay() {
  document.getElementById('status-overlay').classList.add('hidden');
  // Matikan kamera agar tidak terjadi infinite loop saat error permanen
  document.getElementById('camera-section').classList.add('hidden');
  document.getElementById('btn-start-camera').classList.remove('hidden');
  document.getElementById('btn-stop-camera').classList.add('hidden');
}

document.getElementById('btn-close-error').addEventListener('click', closeErrorOverlay);

// ── Liveness UI helpers
const livenessOverlay = () => document.getElementById('liveness-overlay');
const livenessIcon    = () => document.getElementById('liveness-icon');
const livenessText    = () => document.getElementById('liveness-text');
const livenessStatus  = () => document.getElementById('liveness-status');
const livenessRetry   = () => document.getElementById('liveness-retry-btn');
const timerBar        = () => document.getElementById('liveness-timer-bar');

// Sambungkan tombol retry via addEventListener (lebih reliable daripada onclick)
document.getElementById('liveness-retry-btn').addEventListener('click', () => {
  if (typeof window._livenessRetry === 'function') {
    window._livenessRetry();
  }
});

function showLiveness(challenge) {
  livenessIcon().textContent  = challenge.icon;
  livenessText().textContent  = challenge.text;
  livenessStatus().textContent = 'Ikuti instruksi di atas dalam 6 detik';
  livenessRetry().style.display = 'none';
  timerBar().style.transition = 'none';
  timerBar().style.width = '100%';
  livenessOverlay().style.display = 'block';
  // Mulai animasi timer bar (6 detik)
  requestAnimationFrame(() => {
    timerBar().style.transition = 'width 6s linear';
    timerBar().style.width = '0%';
  });
}

function hideLiveness() {
  livenessOverlay().style.display = 'none';
}

function setLivenessSuccess() {
  livenessIcon().textContent   = '✅';
  livenessText().textContent   = 'Liveness Terverifikasi!';
  livenessStatus().textContent = 'Sedang memproses absensi...';
  timerBar().style.transition  = 'none';
  timerBar().style.width       = '100%';
  timerBar().style.background  = '#10b981';
  livenessRetry().style.display = 'none';
}

function setLivenessFail(msg) {
  livenessIcon().textContent   = '❌';
  livenessText().textContent   = 'Tantangan Gagal';
  livenessStatus().textContent = msg || 'Waktu habis. Silakan coba lagi.';
  timerBar().style.transition  = 'none';
  timerBar().style.width       = '0%';
  livenessRetry().style.display = 'inline-block';
}

// Jalankan liveness challenge + retry jika gagal
function runLivenessFlow(match) {
  return new Promise(resolve => {
    const attempt = async () => {
      const challenge = Liveness.random();

      // Karena kamera sudah di-unmirrored (scaleX(-1)), swap arah left/right:
      // user's LEFT di layar = kamera arah KANAN (dx > 0)
      // user's RIGHT di layar = kamera arah KIRI  (dx < 0)
      const displayChallenge = {
        ...challenge,
        id: challenge.id === 'left'  ? 'right' :
            challenge.id === 'right' ? 'left'  : challenge.id
      };

      showLiveness(challenge); // tampilkan teks asli (Kiri/Kanan sesuai yang user lihat)

      const result = await Liveness.runChallenge(videoEl, displayChallenge.id, 6000);

      if (result.passed) {
        setLivenessSuccess();
        await new Promise(r => setTimeout(r, 900));
        hideLiveness();
        resolve(true);
      } else {
        setLivenessFail('Waktu habis. Tekan tombol di bawah untuk coba tantangan baru.');
        window._livenessRetry = () => {
          window._livenessRetry = null;
          timerBar().style.background = 'linear-gradient(90deg, var(--primary), #818cf8)';
          attempt();
        };
      }
    };
    attempt();
  });
}

// ── Handle face match
async function handleDetected(match) {
  if (isProcessing) return;
  isProcessing = true;

  // Pause loop deteksi tapi biarkan video tetap hidup (untuk liveness)
  FaceRec.pauseDetection();

  try {
    // ── Liveness Challenge
    const livenessOk = await runLivenessFlow(match);
    if (!livenessOk) {
      isProcessing = false;
      startDetection(); // resume deteksi
      return;
    }

    // Liveness passed — sekarang stop video
    FaceRec.stopVideo();

    // ── Ambil lokasi GPS
    let loc;
    try {
      loc = await getLocation();
    } catch (locErr) {
      showOverlay('error', '📍', 'Lokasi Diperlukan', locErr.message);
      restartCamera();
      return;
    }

    // ── Tentukan action: checkin atau checkout
    const today = new Date().toISOString().split('T')[0];
    const existing = await Auth.apiCall('GET', `/api/attendance/me?date=${today}`);
    const rec = existing[0];

    if (rec && rec.check_in && rec.check_out) {
      showOverlay('success', '🎉', 'Absen Selesai', 'Anda sudah menyelesaikan absensi masuk dan keluar untuk hari ini.');
      return;
    }

    const action = (!rec || !rec.check_in) ? 'checkin' : 'checkout';

    // ── Kirim ke API
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
  }
}

function restartCamera() {
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
      <button id="btn-reload" class="btn btn-primary btn-sm" style="margin-top:16px;">Coba Lagi</button>
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
  isProcessing = false; // Reset lock agar bisa mendeteksi wajah lagi
  cameraSection.classList.remove('hidden');
  btnStart.classList.add('hidden');
  btnStop.classList.remove('hidden');
  await FaceRec.startVideo(videoEl);
  videoEl.addEventListener('play', startDetection, { once: true });
});

init();
