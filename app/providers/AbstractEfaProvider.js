/**
 * Abstract EFA (Electronic Fahrplan Auskunft) provider.
 *
 * Ported from de.schildbach.pte.AbstractEfaProvider (Java).
 *
 * Uses JSON output for the stopfinder endpoint and JSON for the trip
 * endpoint.  Subclasses only need to supply the API base URL and optional
 * configuration overrides (see VrnProvider).
 */
import { request as httpsRequest } from 'https';
import { request as httpRequest } from 'http';
import { AbstractProvider } from './AbstractProvider.js';

/* ---------- default EFA endpoint paths ---------- */
const DEFAULT_STOPFINDER_ENDPOINT = 'XML_STOPFINDER_REQUEST';
const DEFAULT_TRIP_ENDPOINT = 'XSLT_TRIP_REQUEST2';
const DEFAULT_DM_ENDPOINT = 'XSLT_DM_REQUEST';
const DEFAULT_COORD_ENDPOINT = 'XML_COORD_REQUEST';
const COORD_FORMAT = 'WGS84[DD.ddddd]';

export class AbstractEfaProvider extends AbstractProvider {
  /**
   * @param {string} networkId – e.g. 'VRN'
   * @param {string} apiBase   – e.g. 'https://www.vrn.de/mngvrn/'
   * @param {object} [opts]    – optional endpoint overrides
   */
  constructor(networkId, apiBase, opts = {}) {
    super(networkId);
    this._apiBase = apiBase.replace(/\/+$/, '');

    this._stopFinderEndpoint = opts.stopFinderEndpoint || DEFAULT_STOPFINDER_ENDPOINT;
    this._tripEndpoint = opts.tripEndpoint || DEFAULT_TRIP_ENDPOINT;
    this._dmEndpoint = opts.dmEndpoint || DEFAULT_DM_ENDPOINT;
    this._coordEndpoint = opts.coordEndpoint || DEFAULT_COORD_ENDPOINT;

    /* ---- config flags (mirrors Java setters) ---- */
    this._language = 'de';
    this._includeRegionId = true;
    this._useProxFootSearch = true;
    this._needsSpEncId = false;
    this._useLineRestriction = true;
    this._useStringCoordListOutputFormat = true;
    this._useRouteIndexAsTripId = true;
    this._requestUrlEncoding = 'utf-8';
    this._styles = {};
    this._numTripsRequested = 5;
  }

  /* ---- configuration setters ---- */
  setLanguage(v) { this._language = v; return this; }
  setIncludeRegionId(v) { this._includeRegionId = v; return this; }
  setRequestUrlEncoding(v) { this._requestUrlEncoding = v; return this; }
  setUseProxFootSearch(v) { this._useProxFootSearch = v; return this; }
  setNeedsSpEncId(v) { this._needsSpEncId = v; return this; }
  setUseLineRestriction(v) { this._useLineRestriction = v; return this; }
  setUseRouteIndexAsTripId(v) { this._useRouteIndexAsTripId = v; return this; }
  setStyles(v) { this._styles = v; return this; }

  /* ================================================================== *
   *  HTTP helper                                                       *
   * ================================================================== */

  _httpGet(url) {
    return new Promise((resolve, reject) => {
      const u = typeof url === 'string' ? new URL(url) : url;
      const reqFn = u.protocol === 'https:' ? httpsRequest : httpRequest;
      const options = {
        method: 'GET',
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        protocol: u.protocol,
        headers: { Accept: 'application/json, text/xml, */*' }
      };
      const req = reqFn(options, res => {
        const chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      });
      req.on('error', reject);
      req.end();
    });
  }

  /* ================================================================== *
   *  Common request-parameter helpers                                  *
   * ================================================================== */

  _appendCommonParams(url, outputFormat) {
    url.searchParams.set('outputFormat', outputFormat);
    url.searchParams.set('language', this._language);
    url.searchParams.set('stateless', '1');
    url.searchParams.set('coordOutputFormat', COORD_FORMAT);
    url.searchParams.set('coordOutputFormatTail', '7');
  }

  _appendLocationParams(url, location, paramSuffix) {
    if (location.type === 'S' && location.id) {
      url.searchParams.set(`type_${paramSuffix}`, 'stop');
      url.searchParams.set(`name_${paramSuffix}`, location.id);
    } else if (location.type === 'P' && location.id) {
      url.searchParams.set(`type_${paramSuffix}`, 'poi');
      url.searchParams.set(`name_${paramSuffix}`, location.id);
    } else if (location.type === 'A' && location.id) {
      url.searchParams.set(`type_${paramSuffix}`, 'address');
      url.searchParams.set(`name_${paramSuffix}`, location.id);
    } else if (location.name) {
      url.searchParams.set(`type_${paramSuffix}`, 'any');
      url.searchParams.set(`name_${paramSuffix}`, location.name);
    } else {
      throw new Error(`Cannot append location: ${JSON.stringify(location)}`);
    }
  }

  /* ================================================================== *
   *  Date / time helpers                                               *
   * ================================================================== */

  /** @returns "YYYYMMDD" */
  static _formatItdDate(d) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  /** @returns "HHmm" */
  static _formatItdTime(d) {
    return `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  }

  /** Convert EFA date "dd.mm.yyyy" (or ISO) + time "hh:mm" → {hciTime, hciDate} */
  static _efaDateTimeToHci(dateStr, timeStr) {
    if (!dateStr || !timeStr) return { hciTime: null, hciDate: null };
    let y, m, d;
    if (dateStr.includes('.')) {
      [d, m, y] = dateStr.split('.');
    } else if (dateStr.includes('-')) {
      [y, m, d] = dateStr.split('-');
    } else {
      y = dateStr.slice(0, 4); m = dateStr.slice(4, 6); d = dateStr.slice(6, 8);
    }
    const tp = timeStr.replace(':', '');
    return { hciTime: `${tp}00`, hciDate: `${y}${m}${d}` };
  }

  /** JS Date → "HHMMSS" */
  static _dateToHciTime(d) {
    if (!d) return null;
    return `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
  }

  /** JS Date → "YYYYMMDD" */
  static _dateToHciDate(d) {
    if (!d) return null;
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  /* ================================================================== *
   *  Session / paging – "command link" for queryMoreTrips               *
   * ================================================================== */

  _commandLink(sessionId, requestId) {
    const url = new URL(`${this._apiBase}/${this._tripEndpoint}`);
    url.searchParams.set('sessionID', sessionId);
    url.searchParams.set('requestID', requestId);
    url.searchParams.set('calcNumberOfTrips', String(this._numTripsRequested));
    if (this._useStringCoordListOutputFormat)
      url.searchParams.set('coordListOutputFormat', 'string');
    return url.toString();
  }

  /* ================================================================== *
   *  suggestLocations  (JSON stopfinder – mirrors jsonStopfinderRequest)*
   * ================================================================== */

  async suggestLocations(query, maxLoc = 10) {
    const url = new URL(`${this._apiBase}/${this._stopFinderEndpoint}`);
    this._appendCommonParams(url, 'JSON');
    url.searchParams.set('locationServerActive', '1');
    if (this._includeRegionId) url.searchParams.set('regionID_sf', '1');
    url.searchParams.set('type_sf', 'any');
    url.searchParams.set('name_sf', query);
    if (this._needsSpEncId) url.searchParams.set('SpEncId', '0');

    // anyObjFilter_sf = stop(2)+street(4)+address(8)+crossing(16)+poi(32)+postcode(64) = 126
    url.searchParams.set('anyObjFilter_sf', '126');
    url.searchParams.set('reducedAnyPostcodeObjFilter_sf', '64');
    url.searchParams.set('reducedAnyTooManyObjFilter_sf', '2');
    url.searchParams.set('useHouseNumberList', 'true');
    if (maxLoc > 0) url.searchParams.set('anyMaxSizeHitList', String(maxLoc));

    const body = await this._httpGet(url);
    let json;
    try { json = JSON.parse(body); }
    catch (e) { throw new Error(`EFA stopfinder: cannot parse JSON – ${e.message}`); }

    return this._parseStopfinderJson(json, query);
  }

  /**
   * Parse the EFA JSON stopfinder response.
   * Handles two common shapes:
   *   1. stopFinder is an object with .points (object or array)
   *   2. stopFinder itself is an array of points
   */
  _parseStopfinderJson(json, fallbackName) {
    const locations = [];
    let points = null;

    const sf = json.stopFinder;
    if (sf && typeof sf === 'object' && !Array.isArray(sf)) {
      /* check for error messages */
      const msgs = sf.message ? (Array.isArray(sf.message) ? sf.message : [sf.message]) : [];
      for (const msg of msgs) {
        if (msg.name === 'code' && msg.value !== '-8010' && msg.value !== '-8011')
          return []; // service error
      }
      if (sf.points) {
        if (Array.isArray(sf.points))
          points = sf.points;
        else if (sf.points.point)
          points = Array.isArray(sf.points.point) ? sf.points.point : [sf.points.point];
      }
    } else if (Array.isArray(sf)) {
      points = sf;
    }

    if (!points) return locations;

    for (const pt of points) {
      if (!pt) continue;
      const loc = this._parseJsonPoint(pt, fallbackName);
      if (loc) locations.push(loc);
    }
    return locations;
  }

  /**
   * Parse a single EFA JSON "point" into {type, id, name, _raw}.
   * Maps EFA location types (stop, poi, crossing, …) to S / P / A.
   */
  _parseJsonPoint(point, fallbackName) {
    let type = point.type;
    if (type === 'any') type = point.anyType;

    const stateless = point.stateless || '';
    const name = this._normalizeLocationName(point.name || point.object || fallbackName || '');
    const ref = point.ref || {};
    const id = ref.id;

    let locType;
    if (type === 'stop') locType = 'S';
    else if (type === 'poi') locType = 'P';
    else locType = 'A'; // address, crossing, street, singlehouse, buildingname, postcode, loc

    const locationId = locType === 'S' ? (id || stateless) : (stateless || id);
    if (!locationId) return null;

    return { type: locType, id: locationId, name, _raw: point };
  }

  _normalizeLocationName(name) {
    if (!name) return null;
    return name.replace(/\s+/g, ' ').trim() || null;
  }

  /* ================================================================== *
   *  queryTrips  (JSON trip request)                                    *
   * ================================================================== */

  async queryTrips(fromLoc, toLoc, date, dep = true, _moreCtx = null) {
    const url = new URL(`${this._apiBase}/${this._tripEndpoint}`);
    this._appendCommonParams(url, 'JSON');

    url.searchParams.set('sessionID', '0');
    url.searchParams.set('requestID', '0');
    if (this._useStringCoordListOutputFormat)
      url.searchParams.set('coordListOutputFormat', 'string');

    this._appendLocationParams(url, fromLoc, 'origin');
    this._appendLocationParams(url, toLoc, 'destination');

    url.searchParams.set('itdDate', AbstractEfaProvider._formatItdDate(date));
    url.searchParams.set('itdTime', AbstractEfaProvider._formatItdTime(date));
    url.searchParams.set('itdTripDateTimeDepArr', dep ? 'dep' : 'arr');
    url.searchParams.set('calcNumberOfTrips', String(this._numTripsRequested));
    url.searchParams.set('ptOptionsActive', '1');
    url.searchParams.set('itOptionsActive', '1');
    if (this._useProxFootSearch) url.searchParams.set('useProxFootSearch', '1');
    url.searchParams.set('trITMOTvalue100', '10');
    url.searchParams.set('locationServerActive', '1');
    url.searchParams.set('useRealtime', '1');
    url.searchParams.set('nextDepsPerLeg', '1');

    const body = await this._httpGet(url);
    let json;
    try { json = JSON.parse(body); }
    catch (e) { throw new Error(`EFA trip: cannot parse JSON – ${e.message}`); }

    return this._parseTripJson(json, fromLoc, toLoc);
  }

  /* ================================================================== *
   *  queryMoreTrips                                                     *
   * ================================================================== */

  async queryMoreTrips(context, later) {
    if (!context || !context.nextCtx) {
      return { status: 'OK', trips: [], context: { canQueryLater: false } };
    }

    const url = new URL(context.nextCtx);
    this._appendCommonParams(url, 'JSON');
    url.searchParams.set('command', later ? 'tripNext' : 'tripPrev');

    const body = await this._httpGet(url);
    let json;
    try { json = JSON.parse(body); }
    catch (e) { throw new Error(`EFA tripMore: cannot parse JSON – ${e.message}`); }

    const result = this._parseTripJson(json, context.fromReqLoc, context.toReqLoc);
    result.context.fromReqLoc = context.fromReqLoc;
    result.context.toReqLoc = context.toReqLoc;
    return result;
  }

  /* ================================================================== *
   *  Trip JSON response parsing                                        *
   * ================================================================== */

  _parseTripJson(json, fromLoc, toLoc) {
    /* extract session info for later paging */
    let sessionId = null;
    let requestId = null;

    if (json.parameters && Array.isArray(json.parameters)) {
      for (const p of json.parameters) {
        if (p.name === 'sessionID') sessionId = p.value;
        if (p.name === 'requestID') requestId = p.value;
      }
    }
    sessionId = sessionId || json.sessionID || null;
    requestId = requestId || json.requestID || null;

    const tripsRaw = json.trips || [];
    if (tripsRaw.length === 0) {
      return { status: 'NO_TRIPS', trips: [], context: { canQueryLater: false }, raw: json };
    }

    const trips = [];
    for (const tripRaw of tripsRaw) {
      const parsed = this._parseSingleTrip(tripRaw, fromLoc, toLoc);
      if (parsed) trips.push(parsed);
    }

    const context = {
      canQueryLater: !!(sessionId && requestId),
      nextCtx: sessionId && requestId ? this._commandLink(sessionId, requestId) : null,
      prevCtx: null, // EFA only supports forward paging reliably
      fromReqLoc: fromLoc,
      toReqLoc: toLoc
    };

    return { status: 'OK', trips, context, raw: json };
  }

  _parseSingleTrip(tripRaw, fromLoc, toLoc) {
    const legsRaw = tripRaw.legs || [];
    const legs = [];
    let tripDeparture = null;
    let tripArrival = null;
    let tripBaseDate = null;
    let tripFrom = fromLoc?.name || null;
    let tripTo = toLoc?.name || null;

    for (const legRaw of legsRaw) {
      const leg = this._parseTripLeg(legRaw);
      if (!leg) continue;
      legs.push(leg);

      if (!tripDeparture && leg.depTime) {
        tripDeparture = leg.depTime;
        tripBaseDate = leg._baseDate;
        tripFrom = leg.depName || tripFrom;
      }
      tripArrival = leg.arrTime;
      tripTo = leg.arrName || tripTo;
    }

    if (legs.length === 0) return null;

    const baseDate = tripBaseDate || AbstractEfaProvider._dateToHciDate(new Date());
    for (const leg of legs) delete leg._baseDate;

    return { from: tripFrom, to: tripTo, departure: tripDeparture, arrival: tripArrival, baseDate, legs };
  }

  /**
   * Parse a single EFA trip leg.
   *
   * Each leg contains:
   *   .points  – departure + arrival (as array or {point:[…]})
   *   .mode    – transport mode (type, number, destination, …)
   *
   * mode.type values (from EFA motType):
   *   0 = Zug/train, 1 = S-Bahn, 2 = U-Bahn, 3|4 = Tram,
   *   5|6|7 = Bus, 8 = Cablecar, 9 = Ferry, 10 = On-demand,
   *   97 = do-not-change, 98 = secured-connection,
   *   99|100 = Footway, 105 = Transfer
   */
  _parseTripLeg(legRaw) {
    const mode = legRaw.mode || {};
    const modeType = parseInt(mode.type, 10);

    /* extract departure + arrival points */
    let depPoint = null;
    let arrPoint = null;
    const points = legRaw.points;
    if (points) {
      let pointList;
      if (Array.isArray(points))
        pointList = points;
      else if (points.point)
        pointList = Array.isArray(points.point) ? points.point : [points.point];
      else
        pointList = [];

      for (const p of pointList) {
        if (p.usage === 'departure') depPoint = p;
        else if (p.usage === 'arrival') arrPoint = p;
      }
    }
    if (!depPoint || !arrPoint) return null;

    /* parse times */
    const depDT = depPoint.dateTime || {};
    const arrDT = arrPoint.dateTime || {};
    const depHci = AbstractEfaProvider._efaDateTimeToHci(depDT.date || '', depDT.time || '');
    const arrHci = AbstractEfaProvider._efaDateTimeToHci(arrDT.date || '', arrDT.time || '');

    /* determine line / type */
    let line, dir, type;

    if (modeType === 99 || modeType === 100) {
      line = 'WALK'; dir = null; type = 'WALK';
    } else if (modeType === 105) {
      line = 'TRANSFER'; dir = null; type = 'TRSF';
    } else if (modeType === 97 || modeType === 98) {
      return null; // do-not-change / secured-connection – skip
    } else {
      line = this._buildLineName(modeType, mode);
      dir = mode.destination || mode.destName || null;
      type = 'JNY';
    }

    /* Extract walk path coordinates for WALK legs.
       EFA may provide them as:
         - legRaw.path  (string of space-separated "lon,lat" pairs when coordListOutputFormat=string)
         - legRaw.coords (array of coordinate pairs)
       Fallback: use departure/arrival point coordinates for a straight line. */
    let walkCoords = null;
    if (type === 'WALK') {
      walkCoords = this._extractWalkCoords(legRaw, depPoint, arrPoint);
    }

    return {
      depName: this._normalizeLocationName(depPoint.name || depPoint.nameWithPlace) || null,
      depTime: depHci.hciTime,
      arrName: this._normalizeLocationName(arrPoint.name || arrPoint.nameWithPlace) || null,
      arrTime: arrHci.hciTime,
      line,
      dir,
      type,
      gisCtx: null, // EFA does not use HAFAS-style GIS context
      _walkCoords: walkCoords,
      _baseDate: depHci.hciDate
    };
  }

  /**
   * Extract walk-path coordinates from an EFA walking leg.
   *
   * Returns an array of [lat, lon] pairs (matching the format used by
   * the Haversine distance calculation and Geoapify polyline param),
   * or null if no usable coordinate data is found.
   *
   * EFA provides coordinates in several shapes depending on the backend:
   *   1. legRaw.path – space-separated "lon,lat" string (with coordListOutputFormat=string)
   *   2. legRaw.coords – array of [lon, lat] pairs or {x, y} objects
   *   3. Fallback: departure/arrival point ref.coords ("lon,lat" string)
   */
  _extractWalkCoords(legRaw, depPoint, arrPoint) {
    // 1. Try legRaw.path string  (e.g. "8.123,49.456 8.124,49.457 …")
    if (typeof legRaw.path === 'string' && legRaw.path.trim().length > 0) {
      const pairs = legRaw.path.trim().split(/\s+/);
      const coords = [];
      for (const pair of pairs) {
        const parts = pair.split(',').map(Number);
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          coords.push([parts[1], parts[0]]); // [lat, lon]
        }
      }
      if (coords.length >= 2) return coords;
    }

    // 2. Try legRaw.coords array
    if (Array.isArray(legRaw.coords) && legRaw.coords.length >= 2) {
      const coords = [];
      for (const c of legRaw.coords) {
        if (Array.isArray(c) && c.length >= 2) {
          coords.push([c[1], c[0]]); // [lat, lon]
        } else if (c && typeof c.x === 'number' && typeof c.y === 'number') {
          coords.push([c.y, c.x]); // y=lat, x=lon
        }
      }
      if (coords.length >= 2) return coords;
    }

    // 3. Fallback: straight line from departure → arrival point coords
    const depCoord = this._extractPointCoords(depPoint);
    const arrCoord = this._extractPointCoords(arrPoint);
    if (depCoord && arrCoord) return [depCoord, arrCoord];

    return null;
  }

  /**
   * Extract [lat, lon] from an EFA point's ref.coords ("lon,lat" string)
   * or from ref.x / ref.y numeric fields.
   */
  _extractPointCoords(point) {
    if (!point) return null;
    const ref = point.ref || {};
    if (typeof ref.coords === 'string') {
      const parts = ref.coords.split(',').map(Number);
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return [parts[1], parts[0]]; // [lat, lon]
      }
    }
    if (typeof ref.x === 'number' && typeof ref.y === 'number') {
      return [ref.y, ref.x];
    }
    return null;
  }

  /* ================================================================== *
   *  getWalks – resolve walking-leg graphics + distances                *
   * ================================================================== */

  /**
   * For each walking leg that has coordinate data, generate a static map
   * image (via Geoapify) and compute the walking distance.
   *
   * Mirrors AbstractHafasClientInterfaceProvider.getWalks().
   */
  async getWalks(trip) {
    for (const leg of trip.legs) {
      if (leg.type !== 'WALK' || !leg._walkCoords || leg._walkCoords.length < 2) {
        continue;
      }
      const coordPairs = leg._walkCoords; // [[lat,lon], …]
      const coords = coordPairs
        .map(c => `${c[1]},${c[0]}`)   // lon,lat for Geoapify
        .join(',');
      const startCoord = coords.split(',').slice(0, 2).join(',');
      const endCoord   = coords.split(',').slice(-2).join(',');
      const apiKey = process.env.GEOAPIFY_API_KEY;

      leg.graphic =
        `https://maps.geoapify.com/v1/staticmap?style=positron&width=722&height=356` +
        `&geometry=polyline:${coords};linecolor:%2300983a;linewidth:5;linestyle:longdash` +
        `&marker=lonlat:${startCoord};type:awesome;color:%23fff04a;size:64;icon:1;contentsize:25;contentcolor:%23000000;whitecircle:no` +
        `&marker=lonlat:${endCoord};type:awesome;color:%2300983a;size:64;icon:2;contentsize:25;contentcolor:%23ffffff;whitecircle:no` +
        `&apiKey=${apiKey}`;

      // Haversine distance
      leg.distanceInMeters = coordPairs.reduce((sum, c, i, arr) => {
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

      // Fetch the static map and embed as data-URI
      leg.graphic = await fetch(leg.graphic)
        .then(res => res.arrayBuffer())
        .then(buf => `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`);

      leg._walkCoords = null; // clean up internal field
    }
    return trip;
  }

  /**
   * Build a human-readable line name from the EFA mode object.
   *
   * The output format matches what main.js → lineToStyledHTML() expects:
   *   "Bus 42", "S1", "U3", "RE5", "RB26", "Fäh 62", etc.
   */
  _buildLineName(motType, mode) {
    const number = (mode.number || mode.symbol || '').trim();
    const name = (mode.name || '').trim();
    const trainType = (mode.trainType || '').trim();
    const trainNum = (mode.trainNum || '').trim();

    switch (motType) {
      case 0: { // Zug (long-distance / regional)
        /* try trainType + trainNum first (e.g. "RE 5") */
        if (trainType && trainNum) return `${trainType}${trainNum}`;
        /* symbol might already be "RE5" or "ICE 123" */
        if (number) return number;
        if (name) return name;
        return 'Zug';
      }
      case 1: // S-Bahn
        if (number.startsWith('S')) return number; // already "S1"
        return `S${number || name}`;
      case 2: // U-Bahn
        if (number.startsWith('U')) return number;
        return `U${number || name}`;
      case 3: // Tram (Stadtbahn)
      case 4: // Tram (Straßenbahn)
        return number || name || 'Tram';
      case 5: // Stadtbus
      case 6: // Regionalbus
      case 7: // Schnellbus
        return `Bus ${number || name}`;
      case 8: // Seilbahn / Cablecar
        return number || name || 'Seilbahn';
      case 9: // Fähre / Ferry
        return `Fäh ${number || name}`;
      case 10: // Rufbus / On-demand
        return `Bus ${number || name || 'AST'}`;
      case 11: // sonstige
        return number || name || '?';
      case 12: // Schulbus
        return `Bus ${number || name || 'Schulbus'}`;
      case 13: // SEV / Ersatzverkehr
      case 17:
        return number || name || 'SEV';
      case 14: case 15: case 16: // Fernverkehr
        return number || name || 'Zug';
      case 18: // Zug-Shuttle
        return number || name || 'Shuttle';
      case 19: // Bürgerbus
        return `Bus ${number || name || 'Bürgerbus'}`;
      default:
        return number || name || `mot${motType}`;
    }
  }

  /* ================================================================== *
   *  parseLine – simplified port of the Java parseLine() method         *
   * ================================================================== */

  /**
   * Subclasses can override this to customise line parsing
   * (e.g. VrnProvider overrides for RNV Moonliner prefixes).
   */
  parseLine(id, network, mot, symbol, name, longName, trainType, trainNum, trainName) {
    const motNum = mot != null ? parseInt(mot, 10) : null;
    const trainNumStr = trainNum || '';

    /* mot == 0  → long-distance / regional trains */
    if (motNum === 0) {
      if (trainType || trainNum) {
        const label = (trainType || '') + trainNumStr;
        return { id, network, label };
      }
      return { id, network, label: symbol || name || '' };
    }

    /* mot == 1 → S-Bahn */
    if (motNum === 1) return { id, network, label: symbol || name || `S${trainNumStr}` };
    /* mot == 2 → U-Bahn */
    if (motNum === 2) return { id, network, label: name || symbol || `U${trainNumStr}` };
    /* mot 3-4 → Tram */
    if (motNum === 3 || motNum === 4) return { id, network, label: name || symbol || '' };
    /* mot 5-7 → Bus */
    if (motNum >= 5 && motNum <= 7) return { id, network, label: name || symbol || '' };
    /* mot 8 → Cablecar */
    if (motNum === 8) return { id, network, label: name || symbol || '' };
    /* mot 9 → Ferry */
    if (motNum === 9) return { id, network, label: name || symbol || '' };
    /* mot 10 → On-demand */
    if (motNum === 10) return { id, network, label: name || symbol || '' };

    return { id, network, label: symbol || name || '' };
  }
}
