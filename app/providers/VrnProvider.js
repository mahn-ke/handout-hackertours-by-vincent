/**
 * Provider implementation for Verkehrsverbund Rhein-Neckar (VRN).
 *
 * Mirrors de.schildbach.pte.VrnProvider.
 */
import { AbstractEfaProvider } from './AbstractEfaProvider.js';

const API_BASE = 'https://www.vrn.de/mngvrn/';

export class VrnProvider extends AbstractEfaProvider {
  constructor() {
    super('VRN', API_BASE);
    this.setIncludeRegionId(false);
    this.setRequestUrlEncoding('utf-8');
  }

  /** @override */
  async lineToStyledHTML(line) {
    const imageUrl = `https://koveb-koblenz.nahverkehrsdaten.com/kovebkoblenz_gis/10_svg/${encodeURIComponent(line)}.svg`;
    try {
      const response = await fetch(imageUrl, { method: 'HEAD' });
      if (response.ok) {
        return `<img src="${imageUrl}" alt="${line}" class="o-transport-icon o-transport-icon--32" />`;
      }
    } catch (error) {
      console.error('Error checking image URL:', error);
    }
    line = line.replace("Bus ", "");
    return `<div class="vrn-bus">${encodeURIComponent(line)}</div>`;
  }

  /**
   * Override line parsing for VRN-specific quirks (RNV Moonliner, RNV/SWK prefixes).
   * Mirrors VrnProvider.parseLine() in Java.
   */
  parseLine(id, network, mot, symbol, name, longName, trainType, trainNum, trainName) {
    if (mot === '0' || mot === 0) {
      if (longName === 'InterRegio' && !symbol)
        return { id, network, label: 'IR' };
    }
    if (name && name.startsWith('RNV Moonliner '))
      return super.parseLine(id, network, mot, symbol, 'M' + name.substring(14), longName, trainType, trainNum, trainName);
    if (name && (name.startsWith('RNV ') || name.startsWith('SWK ')))
      return super.parseLine(id, network, mot, symbol, name.substring(4), longName, trainType, trainNum, trainName);
    return super.parseLine(id, network, mot, symbol, name, longName, trainType, trainNum, trainName);
  }
}
