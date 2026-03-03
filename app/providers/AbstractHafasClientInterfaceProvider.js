/**
 * Abstract HAFAS Client Interface provider.
 *
 * Extracts all HAFAS-protocol logic (envelope building, HTTP posting,
 * response parsing) from the original shortTrip.js so concrete providers
 * only need to supply configuration.
 *
 * Mirrors the Java class hierarchy:
 *   AbstractProvider → AbstractHafasClientInterfaceProvider → ShProvider
 */
import { request } from 'https';
import polyline from '@mapbox/polyline';
import { AbstractProvider } from './AbstractProvider.js';

const { decode } = polyline;

export class AbstractHafasClientInterfaceProvider extends AbstractProvider {
  /**
   * @param {string}   networkId  – e.g. 'SH'
   * @param {string}   apiBase    – e.g. 'https://nahsh.hafas.cloud/'
   * @param {string[]} productsMap – not used at runtime yet, kept for parity
   */
  constructor(networkId, apiBase, productsMap = []) {
    super(networkId);
    this._apiBase = apiBase.replace(/\/+$/, '');
    this._productsMap = productsMap;

    // defaults – overridden via setters
    this._apiEndpoint = 'mgate.exe';
    this._apiVersion = '1.52';
    this._apiClient = { id: 'HAFAS', type: 'AND' };
    this._apiAuthorization = {};
  }

  /* ---- configuration setters (mirror Java API) ---- */
  setApiEndpoint(v) { this._apiEndpoint = v; }
  setApiVersion(v) { this._apiVersion = v; }
  setApiClient(v) { this._apiClient = typeof v === 'string' ? JSON.parse(v) : v; }
  setApiAuthorization(v) { this._apiAuthorization = typeof v === 'string' ? JSON.parse(v) : v; }

  /* ---- low-level HAFAS helpers ---- */

  _buildEnvelope(meth, req, formatted = false) {
    return {
      auth: this._apiAuthorization,
      client: this._apiClient,
      ver: this._apiVersion,
      lang: 'eng',
      svcReqL: [
        { meth: 'ServerInfo', req: { getServerDateTime: true, getTimeTablePeriod: false } },
        { meth, cfg: { polyEnc: 'GPA' }, req }
      ],
      formatted
    };
  }

  _buildWalkEnvelope(gisCtx, formatted = false) {
    return {
      auth: this._apiAuthorization,
      client: this._apiClient,
      ver: this._apiVersion,
      lang: 'eng',
      svcReqL: [{ req: { gisCtx }, meth: 'GisRoute' }],
      formatted
    };
  }

  _postJson(bodyObj) {
    return new Promise((resolve, reject) => {
      const url = new URL(this._apiBase);
      const fullPath = `${url.pathname.replace(/\/$/, '')}/${this._apiEndpoint}`;
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
          try { resolve(JSON.parse(buf.toString('utf8'))); }
          catch (e) { reject(new Error(`Failed parsing JSON: ${e.message}; body=${buf.toString('utf8').slice(0, 200)}`)); }
        });
      });
      req.on('error', reject);
      req.write(JSON.stringify(bodyObj));
      req.end();
    });
  }

  /* ---- helpers ---- */

  static _formatDateForHci(d) {
    return `${d.getFullYear().toString().padStart(4, '0')}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}`;
  }

  static _formatTimeForHci(d) {
    return `${d.getHours().toString().padStart(2, '0')}${d.getMinutes().toString().padStart(2, '0')}00`;
  }

  static _toReqLoc(found) {
    if (found.type === 'S') {
      const extId = (found._raw && found._raw.extId) || found.id;
      return { type: 'S', extId: String(extId) };
    }
    if (found.type === 'A' || found.type === 'P') {
      const lid = (found._raw && found._raw.lid) || found.id;
      return { type: found.type, lid: String(lid) };
    }
    return { type: 'S', extId: String(found.id) };
  }

  static _parseLegs(secL, locList, prodList) {
    const legs = [];
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
    return legs;
  }

  /* ---- public provider API ---- */

  async suggestLocations(query, maxLoc = 10) {
    const loc = { name: `${query}?`, type: 'ALL' };
    const req = { input: { field: 'S', loc, maxLoc } };
    const envp = this._buildEnvelope('LocMatch', req, false);
    const json = await this._postJson(envp);
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

  async queryTrips(fromLoc, toLoc, date, dep = true, moreCtx = null) {
    const outDate = AbstractHafasClientInterfaceProvider._formatDateForHci(date);
    const outTime = AbstractHafasClientInterfaceProvider._formatTimeForHci(date);
    const fromReq = AbstractHafasClientInterfaceProvider._toReqLoc(fromLoc);
    const toReq = AbstractHafasClientInterfaceProvider._toReqLoc(toLoc);
    const req = {
      depLocL: [fromReq],
      arrLocL: [toReq],
      outDate,
      outTime,
      outFrwd: !!dep,
      gisFltrL: [{ mode: 'FB', profile: { type: 'F', linDistRouting: false, maxdist: 2000 }, type: 'M', meta: 'foot_speed_normal' }],
      getPolyline: true,
      getPasslist: true,
      getIST: false,
      getEco: false,
      extChgTime: -1
    };
    if (moreCtx) req.ctxScr = moreCtx;
    const envp = this._buildEnvelope('TripSearch', req, false);
    const json = await this._postJson(envp);
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
      const d = con.dep || {};
      const arr = con.arr || {};
      const depLoc = locList[d.locX || 0] || {};
      const arrLoc = locList[arr.locX || 0] || {};
      const legs = AbstractHafasClientInterfaceProvider._parseLegs(con.secL || [], locList, prodList);
      trips.push({
        from: depLoc.name || fromLoc.name,
        to: arrLoc.name || toLoc.name,
        departure: d.dTimeS || d.aTimeS || null,
        arrival: arr.aTimeS || arr.dTimeS || null,
        baseDate: con.date || null,
        legs
      });
    }
    const context = {
      canQueryLater: !!(res.outCtxScrF || res.outCtxScrB),
      nextCtx: res.outCtxScrF || null,
      prevCtx: res.outCtxScrB || null,
      fromReqLoc: fromReq,
      toReqLoc: toReq
    };
    return { status: 'OK', trips, context, raw: json };
  }

  async queryMoreTrips(context, later) {
    const ctx = later ? context.nextCtx : context.prevCtx;
    if (!ctx) return { status: 'OK', trips: [], context: { canQueryLater: false } };
    const req = { ctxScr: ctx, depLocL: [context.fromReqLoc], arrLocL: [context.toReqLoc] };
    const envp = this._buildEnvelope('TripSearch', req, false);
    const json = await this._postJson(envp);
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
      const d = con.dep || {};
      const arr = con.arr || {};
      const depLoc = locList[d.locX || 0] || {};
      const arrLoc = locList[arr.locX || 0] || {};
      const legs = AbstractHafasClientInterfaceProvider._parseLegs(con.secL || [], locList, prodList);
      trips.push({
        from: depLoc.name || null,
        to: arrLoc.name || null,
        departure: d.dTimeS || d.aTimeS || null,
        arrival: arr.aTimeS || arr.dTimeS || null,
        baseDate: con.date || null,
        legs
      });
    }
    const newContext = {
      canQueryLater: !!(res.outCtxScrF || res.outCtxScrB),
      nextCtx: res.outCtxScrF || null,
      prevCtx: res.outCtxScrB || null,
      fromReqLoc: context.fromReqLoc,
      toReqLoc: context.toReqLoc
    };
    return { status: 'OK', trips, context: newContext, raw: json };
  }

  async getWalks(trip) {
    for (const leg of trip.legs) {
      if (typeof leg.gisCtx === 'string') {
        const envp = this._buildWalkEnvelope(leg.gisCtx, false);
        const json = await this._postJson(envp);
        const coords = decode(json.svcResL[0].res.common.polyL[0].crdEncYX)
          .map(c => `${c[1]},${c[0]}`)
          .join(',');
        const startCoord = coords.split(',').slice(0, 2).join(',');
        const endCoord = coords.split(',').slice(-2).join(',');
        const apiKey = process.env.GEOAPIFY_API_KEY;
        leg.graphic =
          `https://maps.geoapify.com/v1/staticmap?style=positron&width=722&height=356` +
          `&geometry=polyline:${coords};linecolor:%2300983a;linewidth:5;linestyle:longdash` +
          `&marker=lonlat:${startCoord};type:awesome;color:%23fff04a;size:64;icon:1;contentsize:25;contentcolor:%23000000;whitecircle:no` +
          `&marker=lonlat:${endCoord};type:awesome;color:%2300983a;size:64;icon:2;contentsize:25;contentcolor:%23ffffff;whitecircle:no` +
          `&apiKey=${apiKey}`;
        leg.distanceInMeters = decode(json.svcResL[0].res.common.polyL[0].crdEncYX).reduce((sum, c, i, arr) => {
          if (i === 0) return 0;
          const prev = arr[i - 1];
          const R = 6371000;
          const dLat = (c[0] - prev[0]) * Math.PI / 180;
          const dLon = (c[1] - prev[1]) * Math.PI / 180;
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(prev[0] * Math.PI / 180) * Math.cos(c[0] * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const cAngle = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return sum + R * cAngle;
        }, 0);
        leg.distanceInMeters = Math.round(leg.distanceInMeters);
        leg.gisCtx = null;
        leg.graphic = await fetch(leg.graphic)
          .then(res => res.arrayBuffer())
          .then(buf => `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`);
      }
    }
    return trip;
  }
}
