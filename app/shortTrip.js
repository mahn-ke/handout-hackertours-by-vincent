#!/usr/bin/env node
import { getDefaultProvider, createProvider } from './providers/index.js';

const { argv, env } = process;

function parseArgs(args) {
  const out = { json: false, debug: false, start: null, dest: null, arrive: null, provider: null };
  const filtered = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') out.json = true;
    else if (a === '--debug') out.debug = true;
    else if (a.startsWith('--arrive=')) out.arrive = a.slice('--arrive='.length);
    else if (a === '--arrive' && i + 1 < args.length) { out.arrive = args[++i]; }
    else if (a.startsWith('--provider=')) out.provider = a.slice('--provider='.length);
    else if (a === '--provider' && i + 1 < args.length) { out.provider = args[++i]; }
    else filtered.push(a);
  }
  if (filtered.length < 2) {
    console.error('Usage: shortTrip.js [--json] [--provider SH] [--arrive "YYYY-MM-DD HH:mm"] <start> <destination>');
    process.exit(1);
  }
  out.start = filtered[0];
  out.dest = filtered[1];
  return out;
}

function nowDate() {
  return new Date();
}

function formatReadableTime(baseDate, hciTime) {
  if (!hciTime) return 'unknown';
  let dayOffset = 0, hh = 0, mm = 0;
  if (/^\d{8}$/.test(hciTime)) {
    dayOffset = parseInt(hciTime.slice(0,2), 10);
    hh = parseInt(hciTime.slice(2,4), 10);
    mm = parseInt(hciTime.slice(4,6), 10);
  } else if (/^\d{6}$/.test(hciTime)) {
    hh = parseInt(hciTime.slice(0,2), 10);
    mm = parseInt(hciTime.slice(2,4), 10);
  } else {
    return hciTime;
  }
  if (baseDate && /^\d{8}$/.test(baseDate)) {
    const yyyy = parseInt(baseDate.slice(0,4), 10);
    const mm0 = parseInt(baseDate.slice(4,6), 10) - 1;
    const dd = parseInt(baseDate.slice(6,8), 10);
    const d = new Date(Date.UTC(yyyy, mm0, dd, hh, mm, 0));
    d.setUTCDate(d.getUTCDate() + dayOffset);
    return `${d.toISOString().slice(0,10)} ${d.toISOString().slice(11,16)}`;
  }
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

function parseUserArrivalTime(str) {
  const s = String(str).trim();
  const d = new Date(s.replace(' ', 'T'));
  if (!isNaN(d.getTime())) return d;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (m) {
    const yyyy = parseInt(m[1], 10), MM = parseInt(m[2], 10) - 1, dd = parseInt(m[3], 10);
    const hh = parseInt(m[4], 10), mi = parseInt(m[5], 10);
    return new Date(yyyy, MM, dd, hh, mi, 0);
  }
  throw new Error('Invalid arrival time format. Use ISO or "YYYY-MM-DD HH:mm"');
}

function dateFromBaseAndHci(baseDate, hciTime) {
  if (!baseDate || !hciTime) return null;
  const yyyy = parseInt(baseDate.slice(0,4), 10);
  const MM = parseInt(baseDate.slice(4,6), 10) - 1;
  const dd = parseInt(baseDate.slice(6,8), 10);
  let dayOffset = 0, hh = 0, mi = 0;
  if (/^\d{8}$/.test(hciTime)) {
    dayOffset = parseInt(hciTime.slice(0,2), 10);
    hh = parseInt(hciTime.slice(2,4), 10);
    mi = parseInt(hciTime.slice(4,6), 10);
  } else if (/^\d{6}$/.test(hciTime)) {
    hh = parseInt(hciTime.slice(0,2), 10);
    mi = parseInt(hciTime.slice(2,4), 10);
  } else {
    return null;
  }
  return new Date(yyyy, MM, dd + dayOffset, hh, mi, 0);
}

function selectLatestBeforeArrival(trips, arriveBy) {
  let best = null;
  for (const t of trips) {
    const when = dateFromBaseAndHci(t.baseDate, t.arrival);
    if (!when) continue;
    if (when.getTime() <= arriveBy.getTime()) {
      if (!best || when.getTime() > dateFromBaseAndHci(best.baseDate, best.arrival).getTime()) {
        best = t;
      }
    }
  }
  return best;
}

function printHuman(result) {
  if (result.status && result.status !== 'OK') {
    console.log(`Status: ${result.status}`);
    return;
  }
  const trips = result.trips || [];
  if (trips.length === 0) {
    console.log('No trips found.');
    return;
  }
  const first = trips[0];
  console.log(`${first.from} -> ${first.to}`);
  console.log(`Departure: ${formatReadableTime(first.baseDate, first.departure)}`);
  console.log(`Arrival:   ${formatReadableTime(first.baseDate, first.arrival)}`);
  for (const leg of first.legs || []) {
    const depT = formatReadableTime(first.baseDate, leg.depTime).slice(-5);
    const arrT = formatReadableTime(first.baseDate, leg.arrTime).slice(-5);
    const lineDir = [leg.line, leg.dir].filter(Boolean).join('/');
    console.log(`(${depT}) ${leg.depName} ---${lineDir || leg.type || 'LEG'}--> (${arrT}) ${leg.arrName}`);
  }
}

/**
 * Main entry point used by the web server.
 *
 * @param {string}  start   – start location query
 * @param {string}  dest    – destination location query
 * @param {string|null} arrive – arrival time string or null
 * @param {import('./providers/AbstractProvider.js').AbstractProvider} [provider] – provider instance (defaults to SH)
 * @returns {Promise<object>}
 */
export async function runShortTripMain(start, dest, arrive, provider) {
  const p = provider || getDefaultProvider();
  const startOptions = await p.suggestLocations(start.trim());
  const destOptions = await p.suggestLocations(dest.trim());
  if (startOptions.length === 0 || destOptions.length === 0) {
    throw new Error('No matching locations for start or destination.');
  }
  const startLoc = startOptions[0];
  const destLoc = destOptions[0];
  if (arrive) {
    const arriveBy = parseUserArrivalTime(arrive.trim());
    let res = await p.queryTrips(startLoc, destLoc, arriveBy, false);
    let chosen = selectLatestBeforeArrival(res.trips || [], arriveBy);
    while (!chosen && res.context && res.context.canQueryLater) {
      res = await p.queryMoreTrips(res.context, false);
      chosen = selectLatestBeforeArrival(res.trips || [], arriveBy);
    }
    if (!chosen) {
      throw new Error('No suitable trip found before arrival time.');
    }
    chosen = await p.getWalks(chosen);
    for (const leg of chosen.legs) {
      if (leg.line && leg.line !== 'WALK') {
        leg.styledLine = await p.lineToStyledHTML(leg.line);
      }
    }
    return chosen.legs;
  } else {
    const result = await p.queryTrips(startLoc, destLoc, nowDate());
    return result;
  }
}

async function main() {
  const { json, debug, start, dest, arrive, provider: providerId } = parseArgs(argv.slice(2));
  const provider = providerId ? createProvider(providerId) : getDefaultProvider();

  if (debug) {
    console.error('Provider:', provider.networkId);
    console.error('Start options:', JSON.stringify((await provider.suggestLocations(start)).slice(0,3), null, 2));
    console.error('Dest options:', JSON.stringify((await provider.suggestLocations(dest)).slice(0,3), null, 2));
  }
  if (arrive) {
    const legs = await runShortTripMain(start, dest, arrive, provider);
    if (json) console.log(JSON.stringify(legs, null, 2)); else printHuman({ status: 'OK', trips: [{ legs }] });
  } else {
    const result = await runShortTripMain(start, dest, null, provider);
    if (json) console.log(JSON.stringify(result.raw || result, null, 2)); else printHuman(result);
    if (result.context && result.context.canQueryLater) {
      const laterResult = await provider.queryMoreTrips(result.context, true);
      if (json) console.log(JSON.stringify(laterResult.raw || laterResult, null, 2)); else printHuman(laterResult);
    }
  }
}

// Run CLI only when executed directly
const isDirectRun = argv[1] && (argv[1].endsWith('shortTrip.js') || argv[1].endsWith('/shortTrip'));
if (isDirectRun) {
  main().catch(err => {
    console.error(err.message || String(err));
    process.exit(1);
  });
}
