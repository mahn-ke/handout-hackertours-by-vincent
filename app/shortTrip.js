#!/usr/bin/env node
import { request } from 'https';
import polyline from '@mapbox/polyline';

const { decode } = polyline;

const { argv, env } = process;

// Defaults from ShProvider.java
const DEFAULT_BASE_URL = 'https://nahsh.hafas.cloud';
const DEFAULT_ENDPOINT = 'gate';
const DEFAULT_CLIENT = { id: 'NAHSH', type: 'AND' };
const DEFAULT_AUTH = { aid: 'r0Ot9FLFNAFxijLW', type: 'AID' };
const DEFAULT_VER = '1.68';

function parseArgs(args) {
  const out = { json: false, debug: false, start: null, dest: null, arrive: null };
  const filtered = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') out.json = true;
    else if (a === '--debug') out.debug = true;
    else if (a.startsWith('--arrive=')) out.arrive = a.slice('--arrive='.length);
    else if (a === '--arrive' && i + 1 < args.length) { out.arrive = args[++i]; }
    else filtered.push(a);
  }
  if (filtered.length < 2) {
    console.error('Usage: shortTrip.js [--json] [--arrive "YYYY-MM-DD HH:mm"] <start> <destination>');
    process.exit(1);
  }
  out.start = filtered[0];
  out.dest = filtered[1];
  return out;
}

function nowDate() {
  return new Date();
}

function formatDateForHci(d) {
  const yyyy = d.getFullYear().toString().padStart(4, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function formatTimeForHci(d) {
  const hh = d.getHours().toString().padStart(2, '0');
  const mi = d.getMinutes().toString().padStart(2, '0');
  return `${hh}${mi}00`;
}

function buildEnvelope(meth, req, formatted = false) {
  const client = env.SH_API_CLIENT ? JSON.parse(env.SH_API_CLIENT) : DEFAULT_CLIENT;
  const auth = env.SH_API_AUTHORIZATION ? JSON.parse(env.SH_API_AUTHORIZATION) : DEFAULT_AUTH;
  const ver = env.SH_API_VERSION || DEFAULT_VER;
  return {
    auth,
    client,
    ver,
    lang: 'eng',
    svcReqL: [
      { meth: 'ServerInfo', req: { getServerDateTime: true, getTimeTablePeriod: false } },
      { meth, cfg: { polyEnc: 'GPA' }, req }
    ],
    formatted
  };
}

function buildWalk(req, formatted = false) {
  const client = env.SH_API_CLIENT ? JSON.parse(env.SH_API_CLIENT) : DEFAULT_CLIENT;
  const auth = env.SH_API_AUTHORIZATION ? JSON.parse(env.SH_API_AUTHORIZATION) : DEFAULT_AUTH;
  const ver = env.SH_API_VERSION || DEFAULT_VER;
  return {
    auth,
    client,
    ver,
    lang: 'eng',
    svcReqL: [
      {
        "req":{"gisCtx":req},
        "meth":"GisRoute"
      }],
    formatted
  };
}

function postJson(path, bodyObj) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, env.SH_API_BASE_URL || DEFAULT_BASE_URL);
    // Ensure trailing slash handling
    const fullPath = `${url.pathname.replace(/\/$/, '')}/${DEFAULT_ENDPOINT}`;
    const options = {
      method: 'POST',
      hostname: url.hostname,
      port: url.port || 443,
      path: fullPath,
      protocol: url.protocol,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    const req = request(options, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        try {
          const json = JSON.parse(buf.toString('utf8'));
          resolve(json);
        } catch (e) {
          reject(new Error(`Failed parsing JSON: ${e.message}; body=${buf.toString('utf8').slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(bodyObj));
    req.end();
  });
}

async function suggestLocations(query, maxLoc = 10) {
  const loc = { name: `${query}?`, type: 'ALL' };
  const req = { input: { field: 'S', loc, maxLoc } };
  const envp = buildEnvelope('LocMatch', req, false);
  const json = await postJson('/', envp);
  const svcResL = json.svcResL || [];
  if (!Array.isArray(svcResL) || svcResL.length < 2) throw new Error('Invalid LocMatch response');
  const svcRes = svcResL[1];
  if (svcRes.err && svcRes.err !== 'OK') throw new Error(`LocMatch error: ${svcRes.err} ${svcRes.errTxt || ''}`);
  const match = svcRes.res && svcRes.res.match;
  const locL = match && match.locL ? match.locL : [];
  const out = [];
  for (const l of locL) {
    const type = l.type || (l.extId ? 'S' : (l.lid ? 'A' : 'ANY'));
    const id = l.extId || l.lid || l.id || null;
    if (!id) continue;
    out.push({ type, id, name: l.name || query, _raw: l });
  }
  return out;
}

async function debugDumpLocMatch(query) {
  try {
    const loc = { name: `${query}?`, type: 'ALL' };
    const req = { input: { field: 'S', loc, maxLoc: 5 } };
    const envp = buildEnvelope('LocMatch', req, false);
    const json = await postJson('/', envp);
    const svcRes = (json.svcResL || [])[1] || {};
    const locL = (((svcRes.res || {}).match) || {}).locL || [];
    console.error('Raw LocMatch top:', JSON.stringify(locL.slice(0,3), null, 2));
  } catch (e) {
    console.error('LocMatch debug failed:', e.message);
  }
}

function toReqLoc(found) {
  if (found.type === 'S') {
    const extId = (found._raw && found._raw.extId) || found.id;
    return { type: 'S', extId: String(extId) };
  }
  if (found.type === 'A' || found.type === 'P') {
    const lid = (found._raw && found._raw.lid) || found.id; // prefer full HAFAS lid string
    return { type: found.type, lid: String(lid) };
  }
  // fallback: assume station
  return { type: 'S', extId: String(found.id) };
}

async function queryTrips(fromLoc, toLoc, date, dep = true, moreCtx = null) {
  const outDate = formatDateForHci(date);
  const outTime = formatTimeForHci(date);
  const fromReq = toReqLoc(fromLoc);
  const toReq = toReqLoc(toLoc);
  const req = {
    depLocL: [fromReq],
    arrLocL: [toReq],
    outDate,
    outTime,
    outFrwd: !!dep,
    gisFltrL: [ { mode: 'FB', profile: { type: 'F', linDistRouting: false, maxdist: 2000 }, type: 'M', meta: 'foot_speed_normal' } ],
    getPolyline: true,
    getPasslist: true,
    getIST: false,
    getEco: false,
    extChgTime: -1
  };
  if (moreCtx) req.ctxScr = moreCtx;
  const envp = buildEnvelope('TripSearch', req, false);
  const json = await postJson('/', envp);
  const svcResL = json.svcResL || [];
  if (!Array.isArray(svcResL) || svcResL.length < 2) throw new Error('Invalid TripSearch response');
  const svcRes = svcResL[1];
  if (svcRes.err && svcRes.err !== 'OK') return { status: svcRes.err, raw: json };
  const res = svcRes.res || {};
  const common = res.common || {};
  const locList = common.locL || [];
  const prodList = common.prodL || [];
  const outConL = res.outConL || [];
  const trips = [];
  for (const con of outConL) {
    const dep = con.dep || {};
    const arr = con.arr || {};
    const depLoc = locList[dep.locX || 0] || {};
    const arrLoc = locList[arr.locX || 0] || {};
    const secL = con.secL || [];
    const legs = [];
    const walkGisCtxs = [];
    for (const sec of secL) {
      const sdep = sec.dep || {};
      const sarr = sec.arr || {};
      const sdepLoc = locList[sdep.locX || 0] || {};
      const sarrLoc = locList[sarr.locX || 0] || {};
      let line = null;
      let dir = null;
      if (sec.jny) {
        const jny = sec.jny;
        if (typeof jny.prodX === 'number') {
          const prod = prodList[jny.prodX] || {};
          line = prod.name || (prod.line && prod.line.name) || prod.addName || null;
        }
        dir = jny.dirTxt || null;
      } else if (sec.type === 'WALK') {
        line = 'WALK';
        if (sec.gis && typeof sec.gis.ctx === 'string') {
          walkGisCtxs.push(sec.gis.ctx);
        }
      } else if (sec.type === 'TRSF' || sec.type === 'DEVI') {
        line = sec.type === 'TRSF' ? 'TRANSFER' : 'DEVI';
      } else if (sec.type === 'CHKIN' || sec.type === 'CHKOUT') {
        line = sec.type;
      }
      legs.push({
        depName: sdepLoc.name || null,
        depTime: sdep.dTimeS || sdep.aTimeS || null,
        arrName: sarrLoc.name || null,
        arrTime: sarr.aTimeS || sarr.dTimeS || null,
        line,
        dir,
        type: sec.type || null,
        gisCtx: (sec.gis && typeof sec.gis.ctx === 'string') ? sec.gis.ctx : null
      });
    }
    // Call GIS endpoint for first and last WALK segments (if present)
    trips.push({
      from: depLoc.name || fromLoc.name,
      to: arrLoc.name || toLoc.name,
      departure: dep.dTimeS || dep.aTimeS || null,
      arrival: arr.aTimeS || arr.dTimeS || null,
      baseDate: con.date || null,
      legs
    });
  }
  const context = { canQueryLater: !!(res.outCtxScrF || res.outCtxScrB), nextCtx: res.outCtxScrF || null, prevCtx: res.outCtxScrB || null, fromReqLoc: fromReq, toReqLoc: toReq };
  return { status: 'OK', trips, context, raw: json };
}

async function queryMoreTrips(context, later) {
  const ctx = later ? context.nextCtx : context.prevCtx;
  if (!ctx) return { status: 'OK', trips: [], context: { canQueryLater: false } };
  const req = { ctxScr: ctx, depLocL: [context.fromReqLoc], arrLocL: [context.toReqLoc] };
  const envp = buildEnvelope('TripSearch', req, false);
  const json = await postJson('/', envp);
  const svcResL = json.svcResL || [];
  if (!Array.isArray(svcResL) || svcResL.length < 2) throw new Error('Invalid TripSearch response');
  const svcRes = svcResL[1];
  if (svcRes.err && svcRes.err !== 'OK') return { status: svcRes.err, raw: json };
  const res = svcRes.res || {};
  const common = res.common || {};
  const locList = common.locL || [];
  const prodList = common.prodL || [];
  const outConL = res.outConL || [];
  const trips = [];
  for (const con of outConL) {
    const dep = con.dep || {};
    const arr = con.arr || {};
    const depLoc = locList[dep.locX || 0] || {};
    const arrLoc = locList[arr.locX || 0] || {};
    const secL = con.secL || [];
    const legs = [];
    const walkGisCtxs = [];
    for (const sec of secL) {
      const sdep = sec.dep || {};
      const sarr = sec.arr || {};
      const sdepLoc = locList[sdep.locX || 0] || {};
      const sarrLoc = locList[sarr.locX || 0] || {};
      let line = null;
      let dir = null;
      if (sec.jny) {
        const jny = sec.jny;
        if (typeof jny.prodX === 'number') {
          const prod = prodList[jny.prodX] || {};
          line = prod.name || (prod.line && prod.line.name) || prod.addName || null;
        }
        dir = jny.dirTxt || null;
      } else if (sec.type === 'WALK') {
        line = 'WALK';
      } else if (sec.type === 'TRSF' || sec.type === 'DEVI') {
        line = sec.type === 'TRSF' ? 'TRANSFER' : 'DEVI';
      } else if (sec.type === 'CHKIN' || sec.type === 'CHKOUT') {
        line = sec.type;
      }
      legs.push({
        depName: sdepLoc.name || null,
        depTime: sdep.dTimeS || sdep.aTimeS || null,
        arrName: sarrLoc.name || null,
        arrTime: sarr.aTimeS || sarr.dTimeS || null,
        line,
        dir,
        type: sec.type || null,
        gisCtx: (sec.gis && typeof sec.gis.ctx === 'string') ? sec.gis.ctx : null
      });
    }
    // Call GIS endpoint for first and last WALK segments (if present)
    if (walkGisCtxs.length > 0) {
      try {
        const firstCtx = walkGisCtxs[0];
        const respFirst = await postGis('/', firstCtx);
        const lastCtx = walkGisCtxs[walkGisCtxs.length - 1];
        if (lastCtx !== firstCtx) {
          const respLast = await postGis('/', lastCtx);
        }
      } catch (e) {
        console.error(`GIS post failed: ${e.message}`);
      }
    }
    trips.push({
      from: depLoc.name || null,
      to: arrLoc.name || null,
      departure: dep.dTimeS || dep.aTimeS || null,
      arrival: arr.aTimeS || arr.dTimeS || null,
      baseDate: con.date || null,
      legs
    });
  }
  const newContext = { canQueryLater: !!(res.outCtxScrF || res.outCtxScrB), nextCtx: res.outCtxScrF || null, prevCtx: res.outCtxScrB || null };
  return { status: 'OK', trips, context: newContext, raw: json };
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

async function getWalks(trip) {
  for (const leg of trip.legs) {
    if (typeof leg.gisCtx === 'string') {
      const envp = buildWalk(leg.gisCtx, false);
      const json = await postJson('/', envp);
      const coords = decode(json.svcResL[0].res.common.polyL[0].crdEncYX).map(c => `${c[1]},${c[0]}`).join(',');
      const startCoord = coords.split(',').slice(0, 2).join(',');
      const endCoord = coords.split(',').slice(-2).join(',');
      const apiKey = env.GEOAPIFY_API_KEY;
      leg.graphic =  `https://maps.geoapify.com/v1/staticmap?style=positron&width=722&height=356` +
        `&geometry=polyline:${coords};linecolor:%2300983a;linewidth:5;linestyle:longdash` +
        `&marker=lonlat:${startCoord};type:awesome;color:%23fff04a;size:64;icon:1;contentsize:25;contentcolor:%23000000;whitecircle:no` +
        `&marker=lonlat:${endCoord};type:awesome;color:%2300983a;size:64;icon:2;contentsize:25;contentcolor:%23ffffff;whitecircle:no` +
        `&apiKey=${apiKey}`;
      // calculate using mapbox
      leg.distanceInMeters = decode(json.svcResL[0].res.common.polyL[0].crdEncYX).reduce((sum, c, i, arr) => {
        if (i === 0) return 0;
        const prev = arr[i-1];
        const R = 6371000; // Earth radius in meters
        const dLat = (c[0] - prev[0]) * Math.PI / 180;
        const dLon = (c[1] - prev[1]) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(prev[0] * Math.PI / 180) * Math.cos(c[0] * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const cAngle = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return sum + R * cAngle;
      }, 0);
      leg.distanceInMeters = Math.round(leg.distanceInMeters);
      leg.gisCtx = null; // avoid confusion with original GIS context string
      // fetch jpeg and return data encoded
      leg.graphic = await fetch(leg.graphic).then(res => res.arrayBuffer()).then(buf => `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`);
    }
  }
  return trip;
}

async function main() {
  const { json, debug, start, dest, arrive } = parseArgs(argv.slice(2));
  const startOptions = await suggestLocations(start);
  const destOptions = await suggestLocations(dest);
  if (startOptions.length === 0 || destOptions.length === 0) {
    console.error('No matching locations for start or destination.');
    process.exit(2);
  }
  if (debug) {
    console.error('Start options:', JSON.stringify(startOptions.slice(0,3), null, 2));
    console.error('Dest options:', JSON.stringify(destOptions.slice(0,3), null, 2));
    await debugDumpLocMatch(start);
    await debugDumpLocMatch(dest);
  }
  const startLoc = startOptions[0];
  const destLoc = destOptions[0];
  if (arrive) {
    const arriveBy = parseUserArrivalTime(arrive);
    let res = await queryTrips(startLoc, destLoc, arriveBy, false);
    let chosen = selectLatestBeforeArrival(res.trips || [], arriveBy);
    while (!chosen && res.context && res.context.canQueryLater) {
      res = await queryMoreTrips(res.context, false);
      chosen = selectLatestBeforeArrival(res.trips || [], arriveBy);
    }
    if (!chosen) {
      console.log('No suitable trip found before arrival time.');
      return;
    }
    chosen = await getWalks(chosen);
    const oneResult = { status: 'OK', trips: [chosen] };
    if (json) console.log(JSON.stringify(chosen.legs, null, 2)); else printHuman(oneResult);
  } else {
    const result = await queryTrips(startLoc, destLoc, nowDate());
    if (json) console.log(JSON.stringify(result.raw || result, null, 2)); else printHuman(result);
    if (result.context && result.context.canQueryLater) {
      const laterResult = await queryMoreTrips(result.context, true);
      if (json) console.log(JSON.stringify(laterResult.raw || laterResult, null, 2)); else printHuman(laterResult);
    }
  }
}

main().catch(err => {
  console.error(err.message || String(err));
  process.exit(1);
});
