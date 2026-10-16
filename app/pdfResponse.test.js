import assert from 'node:assert/strict';
import test from 'node:test';
import {convertHtmlToPdf, handoutResponse} from './pdfResponse.js';

test('HTML is returned by default and PDF is selected when preferred', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(Buffer.from('%PDF-1.7 test'), {status: 200});
  };
  const html = await handoutResponse('<h1>Tour</h1>', 'text/html', {fetchImpl});
  assert.deepEqual(html, {body: '<h1>Tour</h1>', contentType: 'text/html; charset=utf-8', isPdf: false});
  assert.equal(calls, 0);

  const pdf = await handoutResponse('<h1>Tour</h1>', 'application/pdf', {
    gotenbergUrl: 'http://gotenberg:3000', fetchImpl,
  });
  assert.equal(pdf.contentType, 'application/pdf');
  assert.equal(pdf.isPdf, true);
  assert.ok(pdf.body.subarray(0, 5).equals(Buffer.from('%PDF-')));
  assert.equal(calls, 1);
});

test('Accept quality values choose the preferred representation', async () => {
  const html = await handoutResponse('<p>html</p>', 'application/pdf;q=0.5,text/html;q=1', {
    fetchImpl: async () => { throw new Error('PDF should not be requested'); },
  });
  assert.equal(html.isPdf, false);
});

test('PDF conversion uploads rendered HTML to the internal Gotenberg endpoint', async () => {
  let request;
  const bytes = Buffer.from('%PDF-1.7 test');
  const result = await convertHtmlToPdf('<h1>Tour</h1>', {
    gotenbergUrl: 'http://gotenberg:3000/',
    fetchImpl: async (url, options) => {
      request = {url, options};
      return new Response(bytes, {status: 200});
    },
  });
  assert.equal(request.url, 'http://gotenberg:3000/forms/chromium/convert/html');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.body.get('files').name, 'index.html');
  assert.equal(await request.options.body.get('files').text(), '<h1>Tour</h1>');
  assert.deepEqual(result, bytes);
});

test('PDF conversion reports missing config, upstream errors, and invalid output', async () => {
  await assert.rejects(convertHtmlToPdf('<p>x</p>', {gotenbergUrl: ''}), /GOTENBERG_URL/);
  await assert.rejects(convertHtmlToPdf('<p>x</p>', {
    gotenbergUrl: 'http://gotenberg:3000',
    fetchImpl: async () => new Response('unavailable', {status: 503}),
  }), /Gotenberg conversion failed \(503\)/);
  await assert.rejects(convertHtmlToPdf('<p>x</p>', {
    gotenbergUrl: 'http://gotenberg:3000',
    fetchImpl: async () => new Response('not a PDF', {status: 200}),
  }), /invalid PDF/);
});