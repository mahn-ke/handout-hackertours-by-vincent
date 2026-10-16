const PDF_MEDIA_TYPE = 'application/pdf';
const HTML_MEDIA_TYPE = 'text/html';

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
    body: await convertHtmlToPdf(html, options),
    contentType: PDF_MEDIA_TYPE,
    isPdf: true,
  };
}