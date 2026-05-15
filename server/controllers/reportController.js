const { supabaseAdmin } = require('../lib/supabase');
const { generatePDF } = require('../utils/pdfGenerator');
const { generateExcel } = require('../utils/excelGenerator');

function getDateRange(filter, param) {
  const now = new Date();
  let start, end;

  switch (filter) {
    case 'daily':
      start = param || now.toISOString().split('T')[0];
      end = start;
      break;
    case 'weekly': {
      // param: YYYY-Www (misal 2026-W20)
      const [year, week] = (param || '').split('-W');
      if (year && week) {
        const firstDay = new Date(year, 0, 1 + (week - 1) * 7);
        const day = firstDay.getDay();
        firstDay.setDate(firstDay.getDate() - (day === 0 ? 6 : day - 1));
        const lastDay = new Date(firstDay);
        lastDay.setDate(firstDay.getDate() + 6);
        start = firstDay.toISOString().split('T')[0];
        end = lastDay.toISOString().split('T')[0];
      } else {
        const day = now.getDay();
        const diff = now.getDate() - (day === 0 ? 6 : day - 1);
        const mon = new Date(now.setDate(diff));
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        start = mon.toISOString().split('T')[0];
        end = sun.toISOString().split('T')[0];
      }
      break;
    }
    case 'monthly': {
      const [y, m] = (param || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).split('-');
      start = `${y}-${m}-01`;
      end = new Date(y, m, 0).toISOString().split('T')[0];
      break;
    }
    case 'yearly': {
      const y = param || now.getFullYear();
      start = `${y}-01-01`;
      end = `${y}-12-31`;
      break;
    }
    default:
      start = now.toISOString().split('T')[0];
      end = start;
  }
  return { start, end };
}

async function fetchData(filter, param, employeeId) {
  const { start, end } = getDateRange(filter, param);

  let query = supabaseAdmin
    .from('attendance')
    .select('*, employees(name)')
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: true })
    .order('check_in', { ascending: true });

  if (employeeId) query = query.eq('employee_id', employeeId);

  const { data, error } = await query;
  if (error) throw error;
  return { data, start, end };
}

/** GET /api/reports/pdf */
async function downloadPDF(req, res) {
  const { filter = 'monthly', param, employee_id } = req.query;
  try {
    const { data, start, end } = await fetchData(filter, param, employee_id);
    const pdfBuffer = await generatePDF(data, { filter, start, end });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="laporan-absensi-${start}-${end}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/** GET /api/reports/excel */
async function downloadExcel(req, res) {
  const { filter = 'monthly', param, employee_id } = req.query;
  try {
    const { data, start, end } = await fetchData(filter, param, employee_id);
    const buffer = generateExcel(data, { filter, start, end });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="laporan-absensi-${start}-${end}.xlsx"`);
    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/** GET /api/reports/data — untuk preview di browser */
async function getData(req, res) {
  const { filter = 'monthly', param, employee_id } = req.query;
  try {
    const { data, start, end } = await fetchData(filter, param, employee_id);
    return res.json({ data, start, end });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { downloadPDF, downloadExcel, getData };
