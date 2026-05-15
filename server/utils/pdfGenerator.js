const PdfPrinter = require('pdfmake');
const path = require('path');

const fonts = {
  Roboto: {
    normal: path.join(__dirname, '../../node_modules/pdfmake/build/vfs_fonts.js'),
    bold: path.join(__dirname, '../../node_modules/pdfmake/build/vfs_fonts.js'),
    italics: path.join(__dirname, '../../node_modules/pdfmake/build/vfs_fonts.js'),
    bolditalics: path.join(__dirname, '../../node_modules/pdfmake/build/vfs_fonts.js'),
  }
};

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
function statusColor(s) {
  return s === 'hadir' ? '#16a34a' : s === 'terlambat' ? '#d97706' : '#dc2626';
}

async function generatePDF(data, { filter, start, end }) {
  return new Promise((resolve, reject) => {
    try {
      const printer = new PdfPrinter(fonts);
      const filterLabel = { daily: 'Harian', weekly: 'Mingguan', monthly: 'Bulanan', yearly: 'Tahunan' }[filter] || 'Kustom';

      const hadir = data.filter(d => d.status === 'hadir').length;
      const terlambat = data.filter(d => d.status === 'terlambat').length;
      const alpha = data.filter(d => d.status === 'alpha').length;

      const tableBody = [
        [
          { text: 'No', style: 'tableHeader' },
          { text: 'Nama', style: 'tableHeader' },
          { text: 'Tanggal', style: 'tableHeader' },
          { text: 'Masuk', style: 'tableHeader' },
          { text: 'Keluar', style: 'tableHeader' },
          { text: 'Status', style: 'tableHeader' },
        ],
        ...data.map((row, i) => [
          { text: i + 1, alignment: 'center' },
          row.employees?.name || '-',
          { text: formatDate(row.date), fontSize: 8 },
          { text: formatTime(row.check_in), alignment: 'center' },
          { text: formatTime(row.check_out), alignment: 'center' },
          { text: statusLabel(row.status), color: statusColor(row.status), bold: true, alignment: 'center', fontSize: 9 },
        ])
      ];

      const docDefinition = {
        pageSize: 'A4',
        pageOrientation: 'landscape',
        pageMargins: [30, 50, 30, 40],
        content: [
          { text: 'PT. YUDANTA JAYA PUTRA', style: 'company' },
          { text: `LAPORAN ABSENSI KARYAWAN — ${filterLabel.toUpperCase()}`, style: 'title' },
          { text: `Periode: ${formatDate(start)} — ${formatDate(end)}`, style: 'subtitle' },
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 750, y2: 0, lineWidth: 2, lineColor: '#1e40af' }], margin: [0, 8, 0, 12] },
          {
            columns: [
              { text: `Total Data: ${data.length}`, style: 'stat' },
              { text: `✓ Hadir: ${hadir}`, style: 'stat', color: '#16a34a' },
              { text: `⚠ Terlambat: ${terlambat}`, style: 'stat', color: '#d97706' },
              { text: `✗ Alpha: ${alpha}`, style: 'stat', color: '#dc2626' },
            ],
            margin: [0, 0, 0, 12]
          },
          {
            table: {
              headerRows: 1,
              widths: [25, '*', 120, 60, 60, 60],
              body: tableBody
            },
            layout: {
              hLineWidth: (i) => i === 0 || i === 1 ? 2 : 0.5,
              vLineWidth: () => 0.5,
              hLineColor: (i) => i === 0 || i === 1 ? '#1e40af' : '#e5e7eb',
              vLineColor: () => '#e5e7eb',
              fillColor: (i) => i === 0 ? '#1e40af' : (i % 2 === 0 ? '#f0f4ff' : null),
            }
          },
          { text: `Dicetak pada: ${new Date().toLocaleString('id-ID')}`, style: 'footer', margin: [0, 20, 0, 0] },
        ],
        styles: {
          company: { fontSize: 18, bold: true, color: '#1e40af', alignment: 'center', margin: [0, 0, 0, 4] },
          title: { fontSize: 13, bold: true, alignment: 'center', color: '#1e3a8a', margin: [0, 0, 0, 4] },
          subtitle: { fontSize: 10, alignment: 'center', color: '#6b7280', margin: [0, 0, 0, 4] },
          tableHeader: { bold: true, color: 'white', fontSize: 9, alignment: 'center' },
          stat: { fontSize: 10, bold: true, alignment: 'center' },
          footer: { fontSize: 8, color: '#9ca3af', alignment: 'right', italics: true },
        }
      };

      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];
      pdfDoc.on('data', chunk => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generatePDF };
