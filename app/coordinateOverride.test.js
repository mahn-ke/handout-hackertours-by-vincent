import assert from 'node:assert/strict';
import test from 'node:test';
import {clearCoordinateCache, resolveDestination} from './coordinateOverride.js';

test('text destinations retain the existing routing and header behavior', async () => {
  const destination = await resolveDestination('Museum address', null, null, {
    fetchImpl: () => { throw new Error('Geocoder must not be called'); },
  });
  assert.deepEqual(destination, {
    routingQuery: 'Museum address',
    displayAddress: 'Museum address',
  });
});

test('coordinates route to the closest geocoded address but preserve the supplied header label', async () => {
  clearCoordinateCache();
  const fetched = [];
  const fetchImpl = async (url) => {
    fetched.push(new URL(url));
    return {
      ok: true,
      json: async () => ({results: [{formatted: 'Englische Planke 1, 20459 Hamburg, Germany'}]}),
    };
  };

  const first = await resolveDestination('St. Michaelis, Hamburg', '53.5488', '9.9787', {
    apiKey: 'test-key', fetchImpl,
  });
  const second = await resolveDestination('St. Michaelis, Hamburg', 53.5488, 9.9787, {
    apiKey: 'test-key', fetchImpl,
  });

  assert.deepEqual(first, {
    routingQuery: 'Englische Planke 1, 20459 Hamburg, Germany',
    displayAddress: 'St. Michaelis, Hamburg',
  });
  assert.deepEqual(second, first);
  assert.equal(fetched.length, 1);
  assert.equal(fetched[0].searchParams.get('lat'), '53.5488');
  assert.equal(fetched[0].searchParams.get('lon'), '9.9787');
  assert.equal(fetched[0].searchParams.get('apiKey'), 'test-key');
});

test('coordinates supply the printed label when no text label was provided', async () => {
  clearCoordinateCache();
  const destination = await resolveDestination('', 53.5488, 9.9787, {
    apiKey: 'test-key',
    fetchImpl: async () => ({ok: true, json: async () => ({results: [{formatted: 'Hamburg address'}]})}),
  });
  assert.deepEqual(destination, {routingQuery: 'Hamburg address', displayAddress: 'Hamburg address'});
});

test('coordinate overrides require a valid complete pair', async () => {
  await assert.rejects(resolveDestination('Somewhere', '53.5', null), /Both toLat and toLon/);
  await assert.rejects(resolveDestination('Somewhere', '91', '9'), /toLat must be/);
  await assert.rejects(resolveDestination('Somewhere', '53', '181'), /toLon must be/);
});

test('coordinate overrides require a geocoder key and a returned address', async () => {
  await assert.rejects(
    resolveDestination('Somewhere', 53, 9, {apiKey: ''}),
    /GEOAPIFY_API_KEY is required/,
  );
  await assert.rejects(
    resolveDestination('Somewhere', 53, 9, {
      apiKey: 'test-key',
      fetchImpl: async () => ({ok: true, json: async () => ({results: []})}),
    }),
    /No address found/,
  );
  await assert.rejects(
    resolveDestination('Somewhere', 53, 9, {
      apiKey: 'test-key',
      fetchImpl: async () => ({ok: false, status: 503}),
    }),
    /failed \(503\)/,
  );
});