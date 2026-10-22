import axios from 'axios';
import PDFDocument from 'pdfkit';
import { Op, UniqueConstraintError } from 'sequelize';
import { Order, OrderItem, StorePlan, User } from '../models/index.js';
import { toMoney } from '../utils/helpers.js';
import { getSetting } from './settingsService.js';
import { sendInvoiceEmail } from './mailService.js';

/**
 * GST invoices. Course prices are GST-inclusive, so the paid amount is split into taxable value + tax:
 *   buyer in the seller's state      -> CGST + SGST (half each)
 *   buyer in any other state         -> IGST
 *   buyer's state unknown (e.g. old orders) -> treated as the seller's state, as the rules say when the
 *                                      recipient's address is not available.
 * The invoice is a PDF attached to an email sent right after payment (once per order).
 */

const LOG = '[Invoice]';

/** WooCommerce India state code -> { name, GST state code } */
export const IN_STATES = {
  AN: ['Andaman and Nicobar Islands', '35'],
  AP: ['Andhra Pradesh', '37'],
  AR: ['Arunachal Pradesh', '12'],
  AS: ['Assam', '18'],
  BR: ['Bihar', '10'],
  CH: ['Chandigarh', '04'],
  CT: ['Chhattisgarh', '22'],
  DD: ['Daman and Diu', '26'],
  DH: ['Dadra and Nagar Haveli and Daman and Diu', '26'],
  DL: ['Delhi', '07'],
  DN: ['Dadra and Nagar Haveli', '26'],
  GA: ['Goa', '30'],
  GJ: ['Gujarat', '24'],
  HP: ['Himachal Pradesh', '02'],
  HR: ['Haryana', '06'],
  JH: ['Jharkhand', '20'],
  JK: ['Jammu and Kashmir', '01'],
  KA: ['Karnataka', '29'],
  KL: ['Kerala', '32'],
  LA: ['Ladakh', '38'],
  LD: ['Lakshadweep', '31'],
  MH: ['Maharashtra', '27'],
  ML: ['Meghalaya', '17'],
  MN: ['Manipur', '14'],
  MP: ['Madhya Pradesh', '23'],
  MZ: ['Mizoram', '15'],
  NL: ['Nagaland', '13'],
  OR: ['Odisha', '21'],
  PB: ['Punjab', '03'],
  PY: ['Puducherry', '34'],
  RJ: ['Rajasthan', '08'],
  SK: ['Sikkim', '11'],
  TN: ['Tamil Nadu', '33'],
  TR: ['Tripura', '16'],
  TS: ['Telangana', '36'],
  UK: ['Uttarakhand', '05'],
  UP: ['Uttar Pradesh', '09'],
  WB: ['West Bengal', '19']
};
const STATE_CODE_ALIASES = { TG: 'TS', OD: 'OR', UT: 'UK', CG: 'CT' };

/** Normalises a WooCommerce / ISO state code; null when it is not an Indian state. */
export const normalizeStateCode = (code) => {
  const c = String(code || '').trim().toUpperCase();
  if (IN_STATES[c]) return c;
  return STATE_CODE_ALIASES[c] && IN_STATES[STATE_CODE_ALIASES[c]] ? STATE_CODE_ALIASES[c] : null;
};

export const stateName = (code) => IN_STATES[normalizeStateCode(code)]?.[0] || null;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const inr = (n) => `Rs. ${round2(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Splits a GST-inclusive amount. */
export const splitGst = (gross, rate, intraState) => {
  const total = round2(gross);
  const r = Number(rate) || 0;
  const taxable = r > 0 ? round2((total * 100) / (100 + r)) : total;
  const tax = round2(total - taxable);
  if (!(tax > 0)) return { total, taxable, cgst: 0, sgst: 0, igst: 0, tax: 0 };
  if (intraState) {
    const cgst = round2(tax / 2);
    return { total, taxable, cgst, sgst: round2(tax - cgst), igst: 0, tax };
  }
  return { total, taxable, cgst: 0, sgst: 0, igst: tax, tax };
};

/** Indian financial year label, e.g. a date in Oct 2026 -> "2627". */
const financialYear = (date) => {
  const d = new Date(date);
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`;
};

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const below100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const below1000 = (n) => `${n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' : ''}` : ''}${below100(n % 100)}`;
export const amountInWords = (amount) => {
  const rupees = Math.floor(round2(amount));
  const paise = Math.round((round2(amount) - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';
  const parts = [];
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;
  if (crore) parts.push(`${below1000(crore)} Crore`);
  if (lakh) parts.push(`${below1000(lakh)} Lakh`);
  if (thousand) parts.push(`${below1000(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  let words = `${parts.join(' ')} Rupees`;
  if (paise) words += ` and ${below100(paise)} Paise`;
  return `${words} Only`;
};

/** True when white text reads better on this colour. */
const isDark = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum < 160;
};

const logoCache = new Map(); // url -> { at, buffer }
/** Downloads the invoice logo (PNG or JPG, max 2 MB) and keeps it for an hour. Never throws: no logo = company name in text. */
const fetchLogo = async (url) => {
  if (!url) return null;
  const hit = logoCache.get(url);
  if (hit && Date.now() - hit.at < 3600 * 1000) return hit.buffer;
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000, maxContentLength: 2 * 1024 * 1024 });
    const buffer = Buffer.from(res.data);
    const isPng = buffer.slice(0, 4).toString('hex') === '89504e47';
    const isJpg = buffer.slice(0, 2).toString('hex') === 'ffd8';
    if (!isPng && !isJpg) throw new Error('not a PNG or JPG image');
    logoCache.set(url, { at: Date.now(), buffer });
    return buffer;
  } catch (error) {
    console.error(`${LOG} logo ${url} could not be loaded: ${error.message}`);
    return null;
  }
};

const loadSeller = async () => ({
  name: (await getSetting('invoice_company_name')) || 'Antariksh TV',
  address: (await getSetting('invoice_company_address')) || '',
  gstin: String((await getSetting('invoice_gstin')) || '').trim().toUpperCase(),
  stateCode: String((await getSetting('invoice_state_code')) || '20').padStart(2, '0'),
  rate: Number(await getSetting('invoice_gst_rate')) || 0,
  sac: (await getSetting('invoice_sac_code')) || '',
  logoUrl: (await getSetting('invoice_show_logo', 'true')) === 'false' ? '' : String((await getSetting('invoice_logo_url')) || (await getSetting('site_logo_url')) || '').trim(),
  headerColor: /^#[0-9a-fA-F]{6}$/.test(String((await getSetting('invoice_header_color')) || '').trim()) ? String(await getSetting('invoice_header_color')).trim() : '#5b21b6',
  prefix: String((await getSetting('invoice_number_prefix')) || 'ATV').replace(/[^A-Za-z0-9-]/g, '') || 'ATV',
  email: (await getSetting('support_email')) || '',
  phone: (await getSetting('support_phone')) || ''
});

/** Next number for the financial year: ATV/2627/0001 (unique index + retry keeps it gap-free under races). */
const assignInvoiceNumber = async (order, prefix, issuedAt) => {
  if (order.invoice_number) return order.invoice_number;
  const base = `${prefix}/${financialYear(issuedAt)}/`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const last = await Order.findOne({
      where: { invoice_number: { [Op.like]: `${base}%` } },
      order: [['invoice_number', 'DESC']],
      attributes: ['invoice_number']
    });
    const seq = last ? Number(last.invoice_number.slice(base.length)) + 1 : 1;
    const number = `${base}${String(seq).padStart(4, '0')}`;
    try {
      await order.update({ invoice_number: number, invoice_issued_at: issuedAt });
      return number;
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) throw error;
    }
  }
  throw new Error('Could not allocate an invoice number.');
};

/** Everything the PDF and the email need. */
const buildInvoiceData = async (order, seller) => {
  const items = await OrderItem.findAll({ where: { order_id: order.id }, order: [['id', 'ASC']] });
  const user = await User.findByPk(order.user_id, { attributes: ['first_name', 'last_name', 'email', 'phone'] });
  const buyerStateCode = normalizeStateCode(order.billing_state_code);
  const buyerGst = buyerStateCode ? IN_STATES[buyerStateCode][1] : null;
  const intraState = !buyerGst || buyerGst === seller.stateCode;
  // A plan that unlocks several courses is ONE line on the invoice: the plan's name, with its courses listed under it.
  const planIds = [...new Set(items.map((i) => i.store_plan_id).filter(Boolean))];
  const plan = planIds.length === 1 && items.every((i) => i.store_plan_id === planIds[0]) ? await StorePlan.findByPk(planIds[0], { attributes: ['name'] }) : null;
  const lines = plan
    ? [{
        title: `${plan.name}${items.length > 1 ? `
Includes: ${items.map((i) => i.course_title).join(', ')}` : ''}`,
        short: plan.name,
        ...splitGst(round2(items.reduce((sum, i) => sum + Number(i.final_amount), 0)), seller.rate, intraState)
      }]
    : items.map((item) => ({ title: item.course_title, ...splitGst(Number(item.final_amount), seller.rate, intraState) }));
  const sum = (key) => round2(lines.reduce((s, l) => s + l[key], 0));
  return {
    seller,
    intraState,
    buyer: {
      name: order.billing_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Student',
      email: user?.email || '',
      phone: user?.phone || '',
      city: order.billing_city || '',
      state: order.billing_state || stateName(buyerStateCode) || '',
      stateCode: buyerGst || '',
      postcode: order.billing_postcode || ''
    },
    lines,
    totals: { taxable: sum('taxable'), cgst: sum('cgst'), sgst: sum('sgst'), igst: sum('igst'), tax: sum('tax'), total: sum('total') }
  };
};

const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** Renders the invoice to a PDF buffer (A4). */
export const renderInvoicePdf = (order, data) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Invoice ${order.invoice_number}`, Author: data.seller.name } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { seller, buyer, lines, totals, intraState } = data;
    const left = 40;
    const right = 555;
    const width = right - left;
    const ink = '#111827';
    const muted = '#6b7280';
    const brand = '#5b21b6';
    const line = '#e5e7eb';

    // Header band: the logo (or the company name when there is no logo) on the brand colour, invoice details on the right
    const band = seller.headerColor;
    const onBand = isDark(band) ? '#ffffff' : ink;
    const onBandMuted = isDark(band) ? '#e9e5f7' : muted;
    doc.rect(0, 0, 595.28, 98).fill(band);
    let logoDrawn = false;
    if (data.logo) {
      try {
        doc.image(data.logo, left, 24, { fit: [190, 50], valign: 'center' });
        logoDrawn = true;
      } catch (error) {
        console.error(`${LOG} logo could not be drawn (use a PNG or JPG): ${error.message}`);
      }
    }
    if (!logoDrawn) doc.fillColor(onBand).font('Helvetica-Bold').fontSize(20).text(seller.name, left, 38, { width: 260 });
    doc.fillColor(onBand).font('Helvetica-Bold').fontSize(18).text(seller.gstin ? 'TAX INVOICE' : 'INVOICE', 330, 22, { width: right - 330, align: 'right' });
    doc.fillColor(onBand).font('Helvetica-Bold').fontSize(10).text(`Invoice no: ${order.invoice_number}`, 330, 48, { width: right - 330, align: 'right' });
    doc.font('Helvetica').fontSize(9.5).fillColor(onBandMuted).text(`Date: ${fmtDate(order.invoice_issued_at)}`, 330, 63, { width: right - 330, align: 'right' });
    doc.text(`Order: ${order.order_number}`, 330, 77, { width: right - 330, align: 'right' });

    // Seller details under the band
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(11).text(seller.name, left, 112);
    doc.fillColor(muted).font('Helvetica').fontSize(9).text(seller.address, left, 127, { width: 300 });
    if (seller.gstin) doc.fillColor(ink).font('Helvetica-Bold').text(`GSTIN: ${seller.gstin}`, left, doc.y + 2);
    doc.translate(0, 40); // everything below keeps its original layout, shifted under the band

    doc.moveTo(left, 130).lineTo(right, 130).strokeColor(line).stroke();

    // Bill to / place of supply
    doc.fillColor(muted).font('Helvetica-Bold').fontSize(8.5).text('BILLED TO', left, 142);
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(11).text(buyer.name, left, 156);
    doc.font('Helvetica').fontSize(9.5).fillColor(ink);
    const place = [buyer.city, [buyer.state, buyer.postcode].filter(Boolean).join(' - ')].filter(Boolean).join(', ');
    if (place) doc.text(place, left, doc.y + 1, { width: 250 });
    if (buyer.email) doc.text(buyer.email, left, doc.y + 1, { width: 250 });
    if (buyer.phone) doc.text(buyer.phone, left, doc.y + 1, { width: 250 });

    doc.fillColor(muted).font('Helvetica-Bold').fontSize(8.5).text('PLACE OF SUPPLY', 330, 142);
    doc.fillColor(ink).font('Helvetica').fontSize(10)
      .text(buyer.state ? `${buyer.state}${buyer.stateCode ? ` (${buyer.stateCode})` : ''}` : `${seller.address.split(',').slice(-1)[0]?.trim() || ''}`, 330, 156, { width: right - 330 });
    doc.fillColor(muted).font('Helvetica-Bold').fontSize(8.5).text('SERVICE', 330, doc.y + 8);
    doc.fillColor(ink).font('Helvetica').fontSize(10).text(`Online live classes${seller.sac ? ` (SAC ${seller.sac})` : ''}`, 330, doc.y + 2, { width: right - 330 });

    // Table
    let y = Math.max(doc.y, 235) + 18;
    const cols = intraState
      ? [{ k: 'title', t: 'Description', w: 170, a: 'left' }, { k: 'taxable', t: 'Taxable value', w: 85 }, { k: 'rate', t: 'GST %', w: 45 }, { k: 'cgst', t: 'CGST', w: 70 }, { k: 'sgst', t: 'SGST', w: 70 }, { k: 'total', t: 'Amount', w: 75 }]
      : [{ k: 'title', t: 'Description', w: 215, a: 'left' }, { k: 'taxable', t: 'Taxable value', w: 90 }, { k: 'rate', t: 'GST %', w: 50 }, { k: 'igst', t: 'IGST', w: 80 }, { k: 'total', t: 'Amount', w: 80 }];
    const drawRow = (cells, opts = {}) => {
      let x = left;
      const h = opts.h || 22;
      if (opts.fill) doc.rect(left, y, width, h).fill(opts.fill);
      cols.forEach((c, i) => {
        doc.fillColor(opts.color || ink).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 9.5)
          .text(String(cells[i]), x + 6, y + (opts.pad ?? 6), { width: c.w - 12, align: c.a || 'right' });
        x += c.w;
      });
      y += h;
      doc.moveTo(left, y).lineTo(right, y).strokeColor(line).stroke();
    };
    drawRow(cols.map((c) => c.t), { bold: true, fill: '#f3f4f6', h: 24, size: 8.5, color: muted, pad: 8 });
    lines.forEach((l) => {
      const values = { title: l.title, taxable: inr(l.taxable), rate: `${seller.rate}%`, cgst: inr(l.cgst), sgst: inr(l.sgst), igst: inr(l.igst), total: inr(l.total) };
      const h = Math.max(22, doc.heightOfString(l.title, { width: cols[0].w - 12 }) + 14);
      drawRow(cols.map((c) => values[c.k]), { h });
    });
    drawRow(cols.map((c) => ({ title: 'Total', taxable: inr(totals.taxable), rate: '', cgst: inr(totals.cgst), sgst: inr(totals.sgst), igst: inr(totals.igst), total: inr(totals.total) })[c.k]), { bold: true, fill: '#f9fafb', h: 26, pad: 8 });

    // Summary
    y += 14;
    doc.fillColor(muted).font('Helvetica-Bold').fontSize(8.5).text('AMOUNT IN WORDS', left, y);
    doc.fillColor(ink).font('Helvetica').fontSize(10).text(amountInWords(totals.total), left, y + 13, { width: 300 });
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(13).text(`Total paid: ${inr(totals.total)}`, 330, y, { width: right - 330, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(muted).text(
      seller.rate > 0 ? `Price is inclusive of GST @ ${seller.rate}% (${intraState ? `CGST ${seller.rate / 2}% + SGST ${seller.rate / 2}%` : `IGST ${seller.rate}%`}).` : 'No GST charged.',
      330, y + 20, { width: right - 330, align: 'right' }
    );

    doc.fillColor(muted).font('Helvetica').fontSize(8.5)
      .text('This is a computer generated invoice and does not require a signature. Online course access is non-transferable.', left, 733, { width, align: 'center' });
    if (seller.email || seller.phone) doc.text(`Support: ${[seller.email, seller.phone].filter(Boolean).join(' | ')}`, left, 747, { width, align: 'center' });
    doc.end();
  });

const inFlight = new Set();

/**
 * Issues (once) and emails the GST invoice for a paid order. Safe to call on every sync: it does nothing when the
 * invoice was already sent, when invoices are switched off, or when the order is not paid. Never throws.
 */
export const issueAndSendInvoice = async (orderId) => {
  if (inFlight.has(orderId)) return { skipped: 'in_progress' };
  inFlight.add(orderId);
  try {
    if (String(await getSetting('invoice_enabled', 'true')) === 'false') return { skipped: 'disabled' };
    const order = await Order.findByPk(orderId);
    if (!order || order.status !== 'paid') return { skipped: 'not_paid' };
    if (order.invoice_sent_at) return { skipped: 'already_sent' };

    const seller = await loadSeller();
    const issuedAt = order.invoice_issued_at || new Date();
    await assignInvoiceNumber(order, seller.prefix, issuedAt);
    await order.reload();

    const data = await buildInvoiceData(order, seller);
    data.logo = await fetchLogo(seller.logoUrl);
    if (!data.lines.length) return { skipped: 'no_items' };
    const pdf = await renderInvoicePdf(order, data);
    const result = await sendInvoiceEmail({
      to: data.buyer.email,
      name: data.buyer.name,
      invoiceNumber: order.invoice_number,
      total: inr(data.totals.total),
      courses: data.lines.map((l) => l.short || l.title),
      pdf,
      logoUrl: data.logo ? seller.logoUrl : '',
      fileName: `Invoice-${order.invoice_number.replace(/\//g, '-')}.pdf`
    });
    if (result.sent) {
      await order.update({ invoice_sent_at: new Date() });
      console.log(`${LOG} order=${order.order_number} invoice=${order.invoice_number} sent to ${data.buyer.email}`);
      return { sent: true, invoice_number: order.invoice_number };
    }
    console.error(`${LOG} order=${order.order_number} invoice=${order.invoice_number} not sent: ${result.error}`);
    return { sent: false, error: result.error };
  } catch (error) {
    console.error(`${LOG} order=${orderId} failed: ${error.message}`);
    return { sent: false, error: error.message };
  } finally {
    inFlight.delete(orderId);
  }
};

export default { issueAndSendInvoice, renderInvoicePdf, splitGst, amountInWords, normalizeStateCode, stateName, IN_STATES };
