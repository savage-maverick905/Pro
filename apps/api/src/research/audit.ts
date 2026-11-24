import type { Page } from './html.js';

export type Severity = 'major' | 'minor' | 'info';
/** Every issue is a directly observed fact about the fetched homepage (type "observation"); whether it matters is decided later. */
export interface Issue { code: string; severity: Severity; message: string; evidence: string }
export interface AuditInput { page: Page; finalUrl: string; status: number; redirects: string[]; responseMs: number; truncated: boolean; brokenLinks: { url: string; status: number }[]; linksChecked: number }
export interface AuditOutput {
  issues: Issue[]; data: Record<string, unknown>; jsRendered: boolean;
  contacts: { emails: string[]; phones: string[]; contactPageUrl: string | null }; social: { platform: string; url: string }[]; internalLinks: string[];
}

const SOCIAL: Record<string, string> = { 'facebook.com': 'facebook', 'fb.com': 'facebook', 'instagram.com': 'instagram', 'linkedin.com': 'linkedin', 'twitter.com': 'twitter', 'x.com': 'twitter',
  'tiktok.com': 'tiktok', 'youtube.com': 'youtube', 'youtu.be': 'youtube', 'wa.me': 'whatsapp', 'api.whatsapp.com': 'whatsapp', 'whatsapp.com': 'whatsapp' };
export const hostPlatform = (host: string): string | undefined => SOCIAL[host.toLowerCase().replace(/^(www|m|mobile)\./, '')];
const BOOKING_HOSTS = ['calendly.com', 'booksy.com', 'fresha.com', 'opentable.', 'resy.com', 'treatwell.', 'mindbodyonline.com', 'setmore.com', 'simplybook.', 'acuityscheduling.com', 'tock.com', 'thefork.', 'quandoo.', 'doctolib.', 'zocdoc.com', 'cloudbeds.com', 'reservio.com', 'vagaro.com', 'square.site', 'tableagent.com', 'sevenrooms.com'];
const ORDER_HOSTS = ['ubereats.com', 'deliveroo.', 'doordash.com', 'grubhub.com', 'just-eat.', 'toasttab.com', 'glovoapp.com', 'wolt.com', 'foodpanda.', 'order.online', 'chownow.com'];
const SHOP_HINTS = ['cdn.shopify.com', 'myshopify.com', 'woocommerce', 'bigcommerce', 'snipcart', 'ecwid.com', 'squarespace-commerce'];
const SHARE = /(sharer|share\.php|intent\/|\/share|shareArticle)/i;
const CTA = /\b(book|reserve|order|buy|shop|call|contact|get a quote|quote|get started|sign up|subscribe|schedule|appointment|enquire|inquire|request|apply|register)\b/i;
const BOOK_WORD = /\b(book( online| now| a table| an appointment| a room)?|reserve|reservations?|appointments?|schedule)\b/i;
const CART_WORD = /(add to (cart|basket|bag)|checkout|shopping (cart|bag|basket)|view cart)/i;
const ORDER_WORD = /\border (online|now|delivery|takeaway|pickup)\b/i;
const CONTACT_LINK = /contact|kontakt|contacto|contato|contatti|nous-contacter/i;

export function auditPage(i: AuditInput): AuditOutput {
  const { page: p } = i; const issues: Issue[] = []; const add = (code: string, severity: Severity, message: string, evidence: string) => issues.push({ code, severity, message, evidence });
  const base = new URL(i.finalUrl); const bareHost = base.hostname.replace(/^www\./, '');
  const internal = new Set<string>(); const social = new Map<string, string>(); const emails = new Set<string>(); const phones = new Set<string>(); let contactPageUrl: string | null = null;
  const hrefs: string[] = [];
  for (const l of p.links) {
    const h = l.href.trim(); if (!h || h.startsWith('#') || /^javascript:/i.test(h)) continue;
    if (/^mailto:/i.test(h)) { const e = h.slice(7).split('?')[0].trim().toLowerCase(); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && emails.size < 10) emails.add(e); continue; }
    if (/^tel:/i.test(h)) { const t = h.slice(4).replace(/[^\d+]/g, ''); if (t.replace(/\D/g, '').length >= 6 && phones.size < 10) phones.add(t); continue; }
    let u: URL; try { u = new URL(h, base); } catch { continue; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
    hrefs.push(u.href);
    const plat = hostPlatform(u.hostname);
    if (plat && !SHARE.test(u.href)) { if (!social.has(plat)) social.set(plat, u.href); continue; }
    if (u.hostname.replace(/^www\./, '') === bareHost) {
      u.hash = ''; internal.add(u.href);
      if (!contactPageUrl && (CONTACT_LINK.test(u.pathname) || CONTACT_LINK.test(l.text))) contactPageUrl = u.href;
    }
  }
  const linkText = [...p.links.map((l) => l.text), ...p.buttons];
  const textHay = `${p.text.slice(0, 50_000)} ${linkText.join(' ')}`;
  const hostHay = [...hrefs, ...p.scriptSrcs].join(' ').toLowerCase();
  const jsRendered = p.wordCount < 80 && (p.scriptSrcs.length >= 3 || p.inlineScriptBytes > 20_000);

  const h1 = p.headings.filter((h) => h.level === 1).length;
  const imgsMissingAlt = p.images.filter((x) => x.alt === null).length;
  const metaDesc = p.meta.description ?? null; const title = p.title;
  const ctaMatches = linkText.filter((t) => t.length <= 60 && CTA.test(t));
  const bookingHost = BOOKING_HOSTS.find((h) => hostHay.includes(h)); const bookingWord = linkText.find((t) => t.length <= 60 && BOOK_WORD.test(t));
  const shopHint = SHOP_HINTS.find((h) => hostHay.includes(h)) ?? (p.jsonLdTypes.some((t) => t === 'Product' || t === 'Offer') ? 'schema.org Product' : undefined) ?? (CART_WORD.test(textHay) ? 'cart/checkout wording' : undefined);
  const orderHost = ORDER_HOSTS.find((h) => hostHay.includes(h)) ?? (ORDER_WORD.test(textHay) ? 'ordering wording' : undefined);
  const hasPricing = /[£€$]\s?\d|\d\s?(€|£|usd|eur|gbp)\b/i.test(p.text) || linkText.some((t) => /\b(pricing|prices|price list|rates|packages)\b/i.test(t));
  const hasServices = [...p.headings.map((h) => h.text), ...linkText].some((t) => /\b(services|treatments|menu|what we do|our work|products)\b/i.test(t));

  if (i.status >= 400) add('http_error', 'major', 'Homepage returned an error status', `HTTP ${i.status} at ${i.finalUrl}`);
  if (base.protocol !== 'https:') add('no_https', 'major', 'Website is served over HTTP, not HTTPS', `Final URL ${i.finalUrl}`);
  if (!title) add('missing_title', 'major', 'Page has no <title>', 'No <title> element found in homepage HTML');
  else if (title.length < 10 || title.length > 70) add('title_length', 'minor', 'Page title is unusually short or long', `Title is ${title.length} characters`);
  if (!metaDesc) add('missing_meta_description', 'minor', 'No meta description', 'No <meta name="description"> found');
  else if (metaDesc.length < 50 || metaDesc.length > 170) add('meta_description_length', 'minor', 'Meta description length is outside the typical range', `${metaDesc.length} characters`);
  if (!p.meta.viewport) add('no_viewport', 'major', 'No mobile viewport tag, so the page may not be mobile-friendly', 'No <meta name="viewport"> found in homepage HTML');
  if (h1 === 0) add('no_h1', 'minor', 'No <h1> heading', `Headings found: ${p.headings.length}`);
  else if (h1 > 1) add('multiple_h1', 'info', 'More than one <h1> heading', `${h1} <h1> elements`);
  if (p.images.length >= 3 && imgsMissingAlt / p.images.length > 0.3) add('images_missing_alt', 'minor', 'Many images have no alt attribute', `${imgsMissingAlt} of ${p.images.length} images`);
  if (!p.lang) add('no_lang', 'minor', 'No language declared on <html>', 'html lang attribute not present');
  if (/noindex/i.test(p.meta.robots ?? '')) add('noindex', 'major', 'Page asks search engines not to index it', `meta robots: ${p.meta.robots}`);
  if (i.responseMs > 4000) add('slow_response', 'minor', 'Homepage was slow to respond in one measurement', `${i.responseMs} ms (single request from this server)`);
  if (i.brokenLinks.length) add('broken_links', 'major', 'Broken internal links found', `${i.brokenLinks.length} of ${i.linksChecked} checked links returned 404/410: ${i.brokenLinks.slice(0, 3).map((b) => b.url).join(', ')}`);
  if (i.truncated) add('page_truncated', 'info', 'Page was larger than the inspection limit', 'Only the first part of the HTML was analysed');

  if (jsRendered) add('content_not_assessed', 'info', 'Page content appears to be rendered by JavaScript, so content-based checks were skipped', `${p.wordCount} words of static text and ${p.scriptSrcs.length} script files`);
  else {
    if (!emails.size && !phones.size && !contactPageUrl) add('no_contact_info', 'major', 'No email, phone link or contact page found on the homepage', 'No mailto:/tel: links or contact-page link in static HTML');
    if (!ctaMatches.length) add('no_cta', 'minor', 'No clear call-to-action found in buttons or links', 'No button or link text matched action wording');
    if (!bookingHost && !bookingWord) add('no_booking_found', 'info', 'No online booking found', 'No booking links, widgets or wording in static HTML');
    if (!shopHint) add('no_ecommerce_found', 'info', 'No e-commerce functionality found', 'No cart, checkout or store-platform signals in static HTML');
    if (!orderHost) add('no_online_ordering_found', 'info', 'No online ordering found', 'No ordering links or wording in static HTML');
    if (!hasPricing) add('no_pricing_found', 'info', 'No pricing information found', 'No prices or pricing links on the homepage');
    if (!hasServices) add('no_services_found', 'info', 'No services or menu section found', 'No services/menu headings or links on the homepage');
    if (p.wordCount < 150) add('thin_content', 'minor', 'Homepage has very little text', `${p.wordCount} words`);
  }
  if (!p.hasNav && internal.size < 5) add('weak_navigation', 'minor', 'Little visible site navigation', `${internal.size} internal links and no <nav> element`);

  const data = { finalUrl: i.finalUrl, httpStatus: i.status, https: base.protocol === 'https:', redirects: i.redirects, responseMs: i.responseMs, title, titleLength: title?.length ?? 0, metaDescription: metaDesc,
    canonical: p.canonical, lang: p.lang, h1Count: h1, headingCount: p.headings.length, viewport: p.meta.viewport ?? null, images: p.images.length, imagesMissingAlt: imgsMissingAlt, forms: p.forms,
    internalLinkCount: internal.size, linksChecked: i.linksChecked, wordCount: p.wordCount, jsRendered, contentAssessable: !jsRendered, ctaCount: ctaMatches.length, ctaExamples: ctaMatches.slice(0, 5),
    booking: { found: !!(bookingHost || bookingWord), evidence: bookingHost ?? bookingWord ?? null }, ecommerce: { found: !!shopHint, evidence: shopHint ?? null }, ordering: { found: !!orderHost, evidence: orderHost ?? null },
    pricingFound: hasPricing, servicesFound: hasServices, structuredDataTypes: [...new Set(p.jsonLdTypes)], socialLinks: [...social].map(([platform, url]) => ({ platform, url })) };
  return { issues, data, jsRendered, contacts: { emails: [...emails], phones: [...phones], contactPageUrl }, social: [...social].map(([platform, url]) => ({ platform, url })), internalLinks: [...internal] };
}
