// ============================================================
// LAPORAN.JS — Filter, tabel, peta lokasi, export PDF/Excel
// ============================================================
if (!Auth.requireAdmin()) throw new Error('Not admin');
document.getElementById('navbar-container').innerHTML = renderNavbar('laporan');

// ── Set default date params
const today = new Date().toISOString().split('T')[0];
const thisMonth = today.slice(0, 7);
const thisYear = new Date().getFullYear();
document.getElementById('param-date').value = today;
document.getElementById('param-month').value = thisMonth;
document.getElementById('param-year').value = thisYear;

const weekStr = (() => {
  const d = new Date(); const y = d.getFullYear();
  const start = new Date(y, 0, 1);
  const week = Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
  return `${y}-W${String(week).padStart(2, '0')}`;
})();
document.getElementById('param-week').value = weekStr;

// ── Filter type toggle
const filterType = document.getElementById('filter-type');
filterType.addEventListener('change', () => {
  ['daily','weekly','monthly','yearly'].forEach(t => {
    document.getElementById(`param-${t}`).classList.add('hidden');
  });
  document.getElementById(`param-${filterType.value}`).classList.remove('hidden');
});

// ── Load employees untuk filter
async function loadEmployeeFilter() {
  try {
    const data = await Auth.apiCall('GET', '/api/employees');
    const sel = document.getElementById('filter-employee');
    data.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id; opt.textContent = e.name;
      sel.appendChild(opt);
    });
  } catch (e) {}
}

// ── Format helpers
function fmt(ts) { return ts ? new Date(ts).toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'}) : '-'; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('id-ID', {weekday:'short', day:'2-digit', month:'short', year:'numeric'}) : '-'; }
function durasi(cin, cout) {
  if (!cin || !cout) return '-';
  const ms = new Date(cout) - new Date(cin);
  const h = Math.floor(ms/3600000), m = Math.floor((ms%3600000)/60000);
  return `${h}j ${m}m`;
}
function statusBadge(s) {
  const map = { hadir: 'badge-success', terlambat: 'badge-warning', alpha: 'badge-danger' };
  const label = { hadir: 'Hadir', terlambat: 'Terlambat', alpha: 'Alpha' };
  return `<span class="badge ${map[s] || ''}">${label[s] || s}</span>`;
}
function hitungKeterlambatan(cin, status) {
  if (status !== 'terlambat' || !cin) return '<span class="text-muted" style="font-size:12px;">-</span>';
  const cinTime = new Date(cin);
  const batasWaktu = new Date(cinTime);
  batasWaktu.setHours(7, 30, 0, 0); // Asumsi batas waktu 07:30
  const diffMs = cinTime - batasWaktu;
  if (diffMs <= 0) return '<span class="text-muted" style="font-size:12px;">-</span>';
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  return `<span class="text-danger" style="font-size:12px; font-weight:600;">+${h > 0 ? `${h}j ` : ''}${m}m</span>`;
}

// ── Fetch & render
let currentData = [];

async function fetchReport() {
  const filter = filterType.value;
  let param = '';
  if (filter === 'daily') param = document.getElementById('param-date').value;
  else if (filter === 'weekly') param = document.getElementById('param-week').value;
  else if (filter === 'monthly') param = document.getElementById('param-month').value;
  else if (filter === 'yearly') param = document.getElementById('param-year').value;

  const empId = document.getElementById('filter-employee').value;
  const qs = new URLSearchParams({ filter, ...(param ? { param } : {}), ...(empId ? { employee_id: empId } : {}) });

  const tbody = document.getElementById('report-tbody');
  tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding:32px;"><div class="spinner" style="margin:0 auto;"></div></td></tr>`;

  try {
    const res = await Auth.apiCall('GET', `/api/reports/data?${qs}`);
    currentData = res.data;

    const sumRow = document.getElementById('summary-row');
    sumRow.style.display = 'flex';
    document.getElementById('sum-total').textContent = currentData.length;
    document.getElementById('sum-hadir').textContent = currentData.filter(r=>r.status==='hadir').length;
    document.getElementById('sum-terlambat').textContent = currentData.filter(r=>r.status==='terlambat').length;
    document.getElementById('sum-alpha').textContent = currentData.filter(r=>r.status==='alpha').length;
    document.getElementById('sum-periode').textContent = `${fmtDate(res.start)} — ${fmtDate(res.end)}`;

    if (!currentData.length) {
      tbody.innerHTML = `<tr><td colspan="11" class="text-center text-muted" style="padding:48px;">Tidak ada data untuk periode ini</td></tr>`;
      return;
    }

    tbody.innerHTML = currentData.map((row, i) => `
      <tr>
        <td class="text-muted">${i+1}</td>
        <td><div style="font-weight:600;">${row.employees?.name || '-'}</div></td>
        <td style="font-size:13px;">${fmtDate(row.date)}</td>
        <td>${fmt(row.check_in)}</td>
        <td>${fmt(row.check_out)}</td>
        <td>${durasi(row.check_in, row.check_out)}</td>
        <td>${statusBadge(row.status)}</td>
        <td>${hitungKeterlambatan(row.check_in, row.status)}</td>
        <td>
          ${row.check_in_lat ? `<button onclick="showLocation(${i})" class="btn btn-ghost btn-sm" style="padding:4px 10px;font-size:12px;">📍 Lihat</button>` : '<span class="text-muted" style="font-size:12px;">-</span>'}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger" style="padding:32px;">Gagal memuat data: ${err.message}</td></tr>`;
  }
}

document.getElementById('btn-filter').addEventListener('click', fetchReport);

// ── Peta Lokasi
let locMap = null;
window.showLocation = function(idx) {
  const row = currentData[idx];
  if (!row) return;

  document.getElementById('modal-map-title').textContent = `📍 Lokasi Absen — ${row.employees?.name}`;
  document.getElementById('loc-detail').innerHTML = `
    <div class="grid-2" style="gap:8px;">
      <div><strong>Absen Masuk:</strong> ${fmt(row.check_in)}</div>
      <div><strong>Lokasi Masuk:</strong> ${row.check_in_lat?.toFixed(5)}, ${row.check_in_lng?.toFixed(5)}</div>
      ${row.check_out_lat ? `<div><strong>Absen Keluar:</strong> ${fmt(row.check_out)}</div><div><strong>Lokasi Keluar:</strong> ${row.check_out_lat?.toFixed(5)}, ${row.check_out_lng?.toFixed(5)}</div>` : ''}
    </div>
  `;

  document.getElementById('modal-map').classList.add('open');

  setTimeout(() => {
    if (!locMap) {
      locMap = L.map('loc-map').setView([row.check_in_lat, row.check_in_lng], 17);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(locMap);
    } else {
      locMap.eachLayer(l => { if (l instanceof L.Marker) locMap.removeLayer(l); });
      locMap.setView([row.check_in_lat, row.check_in_lng], 17);
    }

    L.marker([row.check_in_lat, row.check_in_lng], {
      icon: L.divIcon({ html: '📍<br><b style="font-size:10px;color:#3b82f6">Masuk</b>', className: '', iconSize: [40, 40] })
    }).addTo(locMap).bindPopup(`Masuk: ${fmt(row.check_in)}`).openPopup();

    if (row.check_out_lat) {
      L.marker([row.check_out_lat, row.check_out_lng], {
        icon: L.divIcon({ html: '📍<br><b style="font-size:10px;color:#10b981">Keluar</b>', className: '', iconSize: [40, 40] })
      }).addTo(locMap).bindPopup(`Keluar: ${fmt(row.check_out)}`);
    }
  }, 100);
};
window.closeModal = (id) => document.getElementById(id).classList.remove('open');

// ── Export PDF
document.getElementById('btn-pdf').addEventListener('click', async () => {
  const filter = filterType.value;
  let param = '';
  if (filter === 'daily') param = document.getElementById('param-date').value;
  else if (filter === 'weekly') param = document.getElementById('param-week').value;
  else if (filter === 'monthly') param = document.getElementById('param-month').value;
  else if (filter === 'yearly') param = document.getElementById('param-year').value;
  const empId = document.getElementById('filter-employee').value;
  const qs = new URLSearchParams({ filter, ...(param ? {param} : {}), ...(empId ? {employee_id:empId} : {}) });

  showToast('info', 'Menyiapkan PDF...', 'Harap tunggu');
  try {
    const res = await fetch(`/api/reports/pdf?${qs}`, { headers: { Authorization: `Bearer ${Auth.getToken()}` } });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `laporan-absensi-${param||filter}.pdf`; a.click();
    URL.revokeObjectURL(url);
    showToast('success', 'PDF berhasil diunduh', '');
  } catch (err) { showToast('error', 'Gagal export PDF', err.message); }
});

// ── Export Excel
document.getElementById('btn-excel').addEventListener('click', async () => {
  const filter = filterType.value;
  let param = '';
  if (filter === 'daily') param = document.getElementById('param-date').value;
  else if (filter === 'weekly') param = document.getElementById('param-week').value;
  else if (filter === 'monthly') param = document.getElementById('param-month').value;
  else if (filter === 'yearly') param = document.getElementById('param-year').value;
  const empId = document.getElementById('filter-employee').value;
  const qs = new URLSearchParams({ filter, ...(param ? {param} : {}), ...(empId ? {employee_id:empId} : {}) });

  showToast('info', 'Menyiapkan Excel...', 'Harap tunggu');
  try {
    const res = await fetch(`/api/reports/excel?${qs}`, { headers: { Authorization: `Bearer ${Auth.getToken()}` } });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `laporan-absensi-${param||filter}.xlsx`; a.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Excel berhasil diunduh', '');
  } catch (err) { showToast('error', 'Gagal export Excel', err.message); }
});

// ── Init
loadEmployeeFilter();
fetchReport();
