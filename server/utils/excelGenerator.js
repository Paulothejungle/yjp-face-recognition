const XLSX = require('xlsx');

function formatTime(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}
function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
function statusLabel(s) {
  return s === 'hadir' ? 'Hadir' : s === 'terlambat' ? 'Terlambat' : 'Alpha';
}

function generateExcel(data, { filter, start, end }) {
  const filterLabel = { daily: 'Harian', weekly: 'Mingguan', monthly: 'Bulanan', yearly: 'Tahunan' }[filter] || 'Kustom';

  const hadir = data.filter(d => d.status === 'hadir').length;
  const terlambat = data.filter(d => d.status === 'terlambat').length;
  const alpha = data.filter(d => d.status === 'alpha').length;

  // Header info
  const headerRows = [
    ['PT. YUDANTA JAYA PUTRA'],
    [`LAPORAN ABSENSI KARYAWAN — ${filterLabel.toUpperCase()}`],
    [`Periode: ${formatDate(start)} — ${formatDate(end)}`],
    [],
    [`Total: ${data.length}`, `Hadir: ${hadir}`, `Terlambat: ${terlambat}`, `Alpha: ${alpha}`],
    [],
    ['No', 'Nama Karyawan', 'Tanggal', 'Jam Masuk', 'Jam Keluar', 'Durasi Kerja', 'Status', 'Lokasi Masuk', 'Lokasi Keluar'],
  ];

  const rows = data.map((row, i) => {
    let durasi = '-';
    if (row.check_in && row.check_out) {
      const diff = new Date(row.check_out) - new Date(row.check_in);
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      durasi = `${h}j ${m}m`;
    }
    const lokasiMasuk = row.check_in_lat ? `${row.check_in_lat?.toFixed(6)}, ${row.check_in_lng?.toFixed(6)}` : '-';
    const lokasiKeluar = row.check_out_lat ? `${row.check_out_lat?.toFixed(6)}, ${row.check_out_lng?.toFixed(6)}` : '-';

    return [
      i + 1,
      row.employees?.name || '-',
      formatDate(row.date),
      formatTime(row.check_in),
      formatTime(row.check_out),
      durasi,
      statusLabel(row.status),
      lokasiMasuk,
      lokasiKeluar,
    ];
  });

  const sheetData = [...headerRows, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Column widths
  ws['!cols'] = [
    { wch: 4 }, { wch: 22 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 24 }, { wch: 24 }
  ];

  // Merge cells untuk header
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 8 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Laporan Absensi');

  // Sheet ringkasan per karyawan
  const employeeMap = {};
  data.forEach(row => {
    const empId = row.employee_id;
    if (!employeeMap[empId]) {
      employeeMap[empId] = { name: row.employees?.name, hadir: 0, terlambat: 0, alpha: 0 };
    }
    employeeMap[empId][row.status]++;
  });

  const summaryData = [
    ['PT. YUDANTA JAYA PUTRA — RINGKASAN ABSENSI'],
    [`Periode: ${formatDate(start)} — ${formatDate(end)}`],
    [],
    ['Nama', 'Hadir', 'Terlambat', 'Alpha', 'Total Hari'],
    ...Object.values(employeeMap).map(e => [
      e.name, e.hadir, e.terlambat, e.alpha, e.hadir + e.terlambat + e.alpha
    ])
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(summaryData);
  ws2['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];
  ws2['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Ringkasan');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { generateExcel };
