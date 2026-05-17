// ============================================================
// ADMIN.JS — Admin Panel Logic
// ============================================================
if (!Auth.requireAdmin()) throw new Error('Not admin');
document.getElementById('navbar-container').innerHTML = renderNavbar('admin');

// ── Tab navigation
const tabs = document.querySelectorAll('.tab-btn');
const tabContents = { karyawan: 'tab-karyawan', enrollment: 'tab-enrollment', pengaturan: 'tab-pengaturan' };
tabs.forEach(btn => {
  btn.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    Object.values(tabContents).forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById(tabContents[btn.dataset.tab]).classList.remove('hidden');
    if (btn.dataset.tab === 'pengaturan' && !settingsMap) initSettingsMap();
    if (btn.dataset.tab === 'enrollment') loadEmployeesForSelect();
  });
});
// Handle anchor link to pengaturan tab
if (window.location.hash === '#pengaturan') {
  document.querySelector('[data-tab="pengaturan"]').click();
}

// ── Modal helpers
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
window.closeModal = closeModal;
document.getElementById('close-modal-add').addEventListener('click', () => closeModal('modal-add-emp'));
document.getElementById('btn-close-modal-cancel').addEventListener('click', () => closeModal('modal-add-emp'));

// ============================================================
// TAB: KARYAWAN
// ============================================================
let employees = [];

document.getElementById('employee-grid').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'enroll') {
    goToEnrollment(btn.dataset.id);
  } else if (action === 'reset-face') {
    resetFace(btn.dataset.id, btn.dataset.name);
  }
});

async function loadEmployees() {
  try {
    employees = await Auth.apiCall('GET', '/api/employees');
    const grid = document.getElementById('employee-grid');
    const count = document.getElementById('emp-count');
    count.textContent = `${employees.length} karyawan aktif`;

    if (!employees.length) {
      grid.innerHTML = `<div class="card" style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text-3);">
        <div style="font-size:48px;margin-bottom:12px;">👥</div>
        <h3 style="color:var(--text-2);">Belum ada karyawan</h3>
        <p class="text-sm" style="margin-top:4px;">Klik "Tambah Karyawan" untuk memulai</p>
      </div>`;
      return;
    }

    grid.innerHTML = employees.map(emp => {
      const hasDescriptor = emp.face_descriptors?.length > 0;
      const initial = emp.name?.[0]?.toUpperCase() || '?';
      return `
        <div class="card emp-card" data-id="${emp.id}">
          <span class="emp-badge badge ${hasDescriptor ? 'badge-success' : 'badge-warning'}">
            ${hasDescriptor ? '✅ Wajah OK' : '⚠️ Belum Enroll'}
          </span>
          <div class="emp-avatar">
            ${emp.photo_url ? `<img src="${emp.photo_url}" alt="${emp.name}">` : initial}
          </div>
          <div style="font-size:16px;font-weight:700;">${emp.name}</div>
          <div class="text-xs" style="color:var(--text-3);margin-top:4px;">${emp.email}</div>
          <div class="emp-actions">
            <button data-action="enroll" data-id="${emp.id}" class="btn btn-primary btn-sm flex-1">📸 Daftar Wajah</button>
            <button data-action="reset-face" data-id="${emp.id}" data-name="${emp.name}" class="btn btn-danger btn-sm">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    showToast('error', 'Gagal memuat karyawan', err.message);
  }
}

async function resetFace(id, name) {
  if (!confirm(`Reset data wajah untuk karyawan "${name}"? Statusnya akan kembali menjadi Belum Enroll.`)) return;
  try {
    await Auth.apiCall('DELETE', `/api/employees/${id}/face`);
    showToast('success', 'Berhasil', `Data wajah ${name} telah direset`);
    loadEmployees();
  } catch (err) {
    showToast('error', 'Gagal mereset wajah', err.message);
  }
}
window.resetFace = resetFace;

function goToEnrollment(id) {
  document.querySelector('[data-tab="enrollment"]').click();
  setTimeout(() => {
    const sel = document.getElementById('enrollment-employee-select');
    sel.value = id;
    sel.dispatchEvent(new Event('change'));
  }, 100);
}
window.goToEnrollment = goToEnrollment;

// Tambah karyawan
document.getElementById('btn-add-emp').addEventListener('click', () => openModal('modal-add-emp'));
document.getElementById('form-add-emp').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-submit-emp');
  btn.disabled = true; btn.textContent = 'Menyimpan...';
  try {
    await Auth.apiCall('POST', '/api/employees', {
      nik: 'EMP-' + Date.now().toString().slice(-6),
      name: document.getElementById('inp-name').value,
      jabatan: null,
      department: null,
      email: document.getElementById('inp-email').value,
      password: document.getElementById('inp-password').value,
    });
    showToast('success', 'Karyawan ditambahkan', 'Selanjutnya lakukan pendaftaran wajah');
    closeModal('modal-add-emp');
    document.getElementById('form-add-emp').reset();
    loadEmployees();
    loadEmployeesForSelect();
  } catch (err) {
    showToast('error', 'Gagal menambahkan', err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Simpan Karyawan';
  }
});

// ============================================================
// TAB: ENROLLMENT WAJAH
// ============================================================
let enrollStream = null;
let enrollDescriptors = [];
let capturedCanvases = [];
const CAPTURE_COUNT = 5;

async function loadEmployeesForSelect() {
  try {
    const data = await Auth.apiCall('GET', '/api/employees');
    const sel = document.getElementById('enrollment-employee-select');
    sel.innerHTML = '<option value="">-- Pilih Karyawan --</option>' +
      data.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  } catch (e) {}
}

document.getElementById('enrollment-employee-select').addEventListener('change', async (e) => {
  const id = e.target.value;
  const cameraDiv = document.getElementById('enrollment-camera');
  if (!id) { cameraDiv.classList.add('hidden'); stopEnrollCamera(); return; }

  cameraDiv.classList.remove('hidden');
  resetEnrollment();

  // Load models jika belum
  if (!FaceRec.loaded) {
    try {
      await FaceRec.loadModels(() => {});
    } catch (err) {
      showToast('error', 'Gagal load model', err.message);
      return;
    }
  }

  // Start kamera
  try {
    const videoEl = document.getElementById('enrollment-video');
    enrollStream = await FaceRec.startVideo(videoEl);
  } catch (err) {
    showToast('error', 'Kamera gagal', err.message);
  }
});

function stopEnrollCamera() {
  if (enrollStream) { enrollStream.getTracks().forEach(t => t.stop()); enrollStream = null; }
}

function resetEnrollment() {
  enrollDescriptors = [];
  capturedCanvases = [];
  const previews = document.querySelectorAll('#enrollment-preview .enrollment-thumb');
  previews.forEach((el, i) => { el.innerHTML = i + 1; el.classList.remove('captured'); });
  document.getElementById('btn-save-face').classList.add('hidden');
}

document.getElementById('btn-reset-capture').addEventListener('click', resetEnrollment);

document.getElementById('btn-capture').addEventListener('click', async () => {
  if (capturedCanvases.length >= CAPTURE_COUNT) return;
  const videoEl = document.getElementById('enrollment-video');
  const canvasEl = document.getElementById('enrollment-canvas');

  try {
    const detections = await faceapi
      .detectSingleFace(videoEl, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (!detections) {
      showToast('warning', 'Wajah tidak terdeteksi', 'Pastikan wajah terlihat jelas di kamera');
      return;
    }

    const idx = capturedCanvases.length;
    enrollDescriptors.push(Array.from(detections.descriptor));

    // Capture frame
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = videoEl.videoWidth; tempCanvas.height = videoEl.videoHeight;
    tempCanvas.getContext('2d').drawImage(videoEl, 0, 0);
    capturedCanvases.push(tempCanvas);

    // Update preview
    const previews = document.querySelectorAll('#enrollment-preview .enrollment-thumb');
    previews[idx].innerHTML = `<img src="${tempCanvas.toDataURL()}" alt="Foto ${idx+1}">`;
    previews[idx].classList.add('captured');

    showToast('success', `Foto ${idx + 1} diambil`, '');

    if (capturedCanvases.length === CAPTURE_COUNT) {
      document.getElementById('btn-save-face').classList.remove('hidden');
      showToast('info', '5 foto berhasil diambil', 'Klik "Simpan Wajah" untuk menyimpan');
    }
  } catch (err) {
    showToast('error', 'Gagal ambil foto', err.message);
  }
});

document.getElementById('btn-save-face').addEventListener('click', async () => {
  const empId = document.getElementById('enrollment-employee-select').value;
  if (!empId || !enrollDescriptors.length) return;

  const btn = document.getElementById('btn-save-face');
  btn.disabled = true; btn.textContent = 'Menyimpan...';

  try {
    // Rata-rata descriptor dari 5 foto
    const avgDescriptor = enrollDescriptors[0].map((_, i) =>
      enrollDescriptors.reduce((sum, d) => sum + d[i], 0) / enrollDescriptors.length
    );

    await Auth.apiCall('POST', `/api/employees/${empId}/face`, { descriptor: avgDescriptor });
    showToast('success', 'Wajah berhasil didaftarkan!', 'Karyawan sekarang bisa melakukan absensi');
    stopEnrollCamera();
    document.getElementById('enrollment-employee-select').value = '';
    document.getElementById('enrollment-camera').classList.add('hidden');
    resetEnrollment();
    loadEmployees();
  } catch (err) {
    showToast('error', 'Gagal menyimpan wajah', err.message);
  } finally {
    btn.disabled = false; btn.textContent = '💾 Simpan Wajah';
  }
});

// ============================================================
// TAB: PENGATURAN
// ============================================================
let settingsMap = null;
let settingsMarker = null;

async function loadSettings() {
  try {
    const s = await Auth.apiCall('GET', '/api/settings');
    document.getElementById('set-lat').value = s.office_lat;
    document.getElementById('set-lng').value = s.office_lng;
    document.getElementById('set-radius').value = s.radius_meters;
    document.getElementById('set-deadline').value = s.check_in_deadline?.slice(0, 5);
    document.getElementById('set-checkout-start').value = s.check_out_start?.slice(0, 5);
    document.getElementById('set-checkout-saturday').value = s.check_out_saturday?.slice(0, 5) || '12:00';
  } catch (e) {}
}

function initSettingsMap() {
  const lat = parseFloat(document.getElementById('set-lat').value) || -6.2088;
  const lng = parseFloat(document.getElementById('set-lng').value) || 106.8456;

  settingsMap = L.map('settings-map').setView([lat, lng], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(settingsMap);

  settingsMarker = L.marker([lat, lng], { draggable: true }).addTo(settingsMap)
    .bindPopup('📍 Kantor PT. Yudanta Jaya Putra').openPopup();

  settingsMap.on('click', (e) => {
    settingsMarker.setLatLng(e.latlng);
    document.getElementById('set-lat').value = e.latlng.lat.toFixed(6);
    document.getElementById('set-lng').value = e.latlng.lng.toFixed(6);
  });

  settingsMarker.on('dragend', (e) => {
    const pos = e.target.getLatLng();
    document.getElementById('set-lat').value = pos.lat.toFixed(6);
    document.getElementById('set-lng').value = pos.lng.toFixed(6);
  });
}

document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await Auth.apiCall('PUT', '/api/settings', {
      office_lat: parseFloat(document.getElementById('set-lat').value),
      office_lng: parseFloat(document.getElementById('set-lng').value),
      radius_meters: parseInt(document.getElementById('set-radius').value),
      check_in_deadline: document.getElementById('set-deadline').value + ':00',
      check_out_start: document.getElementById('set-checkout-start').value + ':00',
      check_out_saturday: document.getElementById('set-checkout-saturday').value + ':00',
    });
    showToast('success', 'Pengaturan disimpan', 'Berlaku untuk absensi selanjutnya');
  } catch (err) {
    showToast('error', 'Gagal menyimpan pengaturan', err.message);
  }
});

// ── Init
loadEmployees();
loadSettings();
loadEmployeesForSelect();
