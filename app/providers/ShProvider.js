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
}
