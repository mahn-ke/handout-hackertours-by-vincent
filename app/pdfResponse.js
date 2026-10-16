import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const PDF_MEDIA_TYPE = 'application/pdf';
const HTML_MEDIA_TYPE = 'text/html';
const STATIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'static');
const ASSET_TYPES = {'.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2'};
// Matches src="static/<file>" and url(<file>) references to files in the static directory.
const ASSET_REFERENCE = /(src=")static\/([\w.-]+)(")|(url\()([\w.-]+)(\))/g;

function acceptedQuality(header, mediaType) {
  for (const part of String(header || '').split(',')) {
    const [type, ...parameters] = part.trim().toLowerCase().split(';');
    if (type !== mediaType) continue;
    const quality = parameters.find(parameter => parameter.trim().startsWith('q='));
    const value = quality ? Number(quality.trim().slice(2)) : 1;
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
  }
  return 0;
}

export function acceptsPdf(acceptHeader) {
  const pdfQuality = acceptedQuality(acceptHeader, PDF_MEDIA_TYPE);
  const htmlQuality = acceptedQuality(acceptHeader, HTML_MEDIA_TYPE);
  return pdfQuality > 0 && (pdfQuality > htmlQuality || htmlQuality === 0);
}

export async function inlineAssets(html, {staticDir = STATIC_DIR} = {}) {
  const names = new Set();
  for (const match of html.matchAll(ASSET_REFERENCE)) names.add(match[2] ?? match[5]);
  const dataUris = new Map();
  for (const name of names) {
    const type = ASSET_TYPES[path.extname(name).toLowerCase()];
    if (!type) continue;
    let content;
    try {
      content = await readFile(path.join(staticDir, name));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    dataUris.set(name, `data:${type};base64,${content.toString('base64')}`);
  }
  return html.replace(ASSET_REFERENCE, (reference, srcStart, srcName, srcEnd, urlStart, urlName, urlEnd) => {
    const dataUri = dataUris.get(srcName ?? urlName);
    if (!dataUri) return reference;
    return srcName ? `${srcStart}${dataUri}${srcEnd}` : `${urlStart}${dataUri}${urlEnd}`;
  });
}

export async function convertHtmlToPdf(html, {
  gotenbergUrl = process.env.GOTENBERG_URL,
  fetchImpl = fetch,
} = {}) {
  if (!gotenbergUrl) throw new Error('GOTENBERG_URL is not configured.');
  const form = new FormData();
  form.append('files', new Blob([html], {type: 'text/html'}), 'index.html');
  const response = await fetchImpl(
    `${gotenbergUrl.replace(/\/+$/, '')}/forms/chromium/convert/html`,
    {method: 'POST', body: form, signal: AbortSignal.timeout(120000)},
  );
  if (!response.ok) throw new Error(`Gotenberg conversion failed (${response.status}).`);
  const pdf = Buffer.from(await response.arrayBuffer());
  if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error('Gotenberg returned an invalid PDF.');
  }
  return pdf;
}

export async function handoutResponse(html, acceptHeader, options) {
  if (!acceptsPdf(acceptHeader)) {
    return {body: html, contentType: `${HTML_MEDIA_TYPE}; charset=utf-8`, isPdf: false};
  }
  return {
    body: await convertHtmlToPdf(await inlineAssets(html, options), options),
    contentType: PDF_MEDIA_TYPE,
    isPdf: true,
  };
}