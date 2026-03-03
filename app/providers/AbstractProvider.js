/**
 * Abstract base class for public transport providers.
 *
 * Subclasses must implement:
 *   - suggestLocations(query, maxLoc)
 *   - queryTrips(fromLoc, toLoc, date, dep, moreCtx)
 *   - queryMoreTrips(context, later)
 *   - getWalks(trip)
 */
export class AbstractProvider {
  /**
   * @param {string} networkId  – e.g. 'SH', 'VRN'
   */
  constructor(networkId) {
    if (new.target === AbstractProvider) {
      throw new Error('AbstractProvider cannot be instantiated directly');
    }
    this.networkId = networkId;
  }

  /**
   * Search for stations / addresses / POIs matching the query.
   * @param {string} query
   * @param {number} [maxLoc=10]
   * @returns {Promise<Array<{type:string, id:string, name:string, _raw:object}>>}
   */
  async suggestLocations(_query, _maxLoc = 10) {
    throw new Error('suggestLocations() not implemented');
  }

  /**
   * Query trips between two resolved locations.
   * @param {object} fromLoc – resolved location object
   * @param {object} toLoc   – resolved location object
   * @param {Date}   date
   * @param {boolean} [dep=true] – true = departure, false = arrival
   * @param {string|null} [moreCtx=null] – scroll context for paging
   * @returns {Promise<object>}
   */
  async queryTrips(_fromLoc, _toLoc, _date, _dep = true, _moreCtx = null) {
    throw new Error('queryTrips() not implemented');
  }

  /**
   * Fetch more trips using a previously returned scroll context.
   * @param {object}  context
   * @param {boolean} later – true = later trips, false = earlier
   * @returns {Promise<object>}
   */
  async queryMoreTrips(_context, _later) {
    throw new Error('queryMoreTrips() not implemented');
  }

  /**
   * Resolve walking-leg geometries (polylines, maps) for a trip.
   * @param {object} trip
   * @returns {Promise<object>}
   */
  async getWalks(trip) {
    return trip; // default: no-op
  }
}
