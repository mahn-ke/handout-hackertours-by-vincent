/**
 * Provider implementation for the Nahverkehrsverbund Schleswig-Holstein
 * (Schleswig-Holstein, Germany).
 *
 * Mirrors de.schildbach.pte.ShProvider
 */
import { AbstractHafasClientInterfaceProvider } from './AbstractHafasClientInterfaceProvider.js';

const API_BASE = 'https://nahsh.hafas.cloud/';

const PRODUCTS_MAP = [
  'HIGH_SPEED_TRAIN', 'HIGH_SPEED_TRAIN', 'HIGH_SPEED_TRAIN',
  'REGIONAL_TRAIN', 'SUBURBAN_TRAIN', 'BUS', 'FERRY',
  'SUBWAY', 'TRAM', 'ON_DEMAND'
];

const DEFAULT_API_CLIENT = '{"id":"NAHSH","type":"AND"}';
const DEFAULT_API_AUTHORIZATION = '{"aid":"r0Ot9FLFNAFxijLW","type":"AID"}';

export class ShProvider extends AbstractHafasClientInterfaceProvider {
  /**
   * @param {string} [apiAuthorization] – JSON string, e.g. '{"aid":"…","type":"AID"}'
   * @param {string} [apiClient]        – JSON string, e.g. '{"id":"NAHSH","type":"AND"}'
   */
  constructor(apiAuthorization, apiClient) {
    super('SH', API_BASE, PRODUCTS_MAP);
    this.setApiEndpoint('gate');
    this.setApiVersion('1.68');
    this.setApiClient(apiClient || DEFAULT_API_CLIENT);
    this.setApiAuthorization(apiAuthorization || DEFAULT_API_AUTHORIZATION);
  }

  /** @override */
  async lineToStyledHTML(line) {
    if (line.startsWith('Bus ')) {
      const number = line.slice(4);
      return '<div class="o-transport-icon o-transport-icon--16 o-transport-icon--buses"><div class="o-transport-icon__number">' + number + '</div></div>';
    }
    if (line.startsWith('S')) {
      const number = line.slice(1);
      return `<div class="o-transport-icon o-transport-icon--16 o-transport-icon--s${number}"><div class="o-transport-icon__number">S${number}</div></div>`;
    }
    if (line.startsWith('U')) {
      const number = line.slice(1);
      return `<div class="o-transport-icon o-transport-icon--16 o-transport-icon--u${number}"><div class="o-transport-icon__number">U${number}</div></div>`;
    }
    if (line.startsWith('X')) {
      const number = line.slice(1);
      return `<div class="o-transport-icon o-transport-icon--16 o-transport-icon--xpressbus"><div class="o-transport-icon__number">X${number}</div></div>`;
    }
    if (line.startsWith('Fäh ')) {
      const number = line.slice(4);
      return `<div class="o-transport-icon o-transport-icon--16 o-transport-icon--ship"><div class="o-transport-icon__number">${number}</div></div>`;
    }
    if (line.startsWith('RB')) {
      const number = line.slice(2);
      return `<div class="o-transport-icon o-transport-icon--16 o-transport-icon--rerb o-transport-icon--transparent"><div class="o-transport-icon__number">RB${number}</div></div>`;
    }
    if (line.startsWith('RE')) {
      const number = line.slice(2);
      return `<div class="o-transport-icon o-transport-icon--16 o-transport-icon--rerb o-transport-icon--transparent"><div class="o-transport-icon__number">RE${number}</div></div>`;
    }
    return line;
  }
}
