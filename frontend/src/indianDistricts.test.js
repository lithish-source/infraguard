import { describe, it, expect } from 'vitest';
import {
  INDIAN_STATES_AND_DISTRICTS,
  ALL_INDIAN_STATES,
  getDistrictsForState,
  detectStateAndDistrict,
} from './data/indianDistricts.js';

describe('Indian States and Districts Frontend Dataset', () => {
  it('covers all 28 states and 8 union territories (total 36)', () => {
    expect(ALL_INDIAN_STATES.length).toBe(36);
    expect(ALL_INDIAN_STATES).toContain('Tamil Nadu');
    expect(ALL_INDIAN_STATES).toContain('Maharashtra');
    expect(ALL_INDIAN_STATES).toContain('Karnataka');
    expect(ALL_INDIAN_STATES).toContain('Delhi');
  });

  it('ensures NO district is repeated across different states', () => {
    const districtToStates = {};
    for (const [state, districts] of Object.entries(INDIAN_STATES_AND_DISTRICTS)) {
      for (const d of districts) {
        const key = d.trim();
        if (!districtToStates[key]) {
          districtToStates[key] = [];
        }
        districtToStates[key].push(state);
      }
    }

    const duplicates = Object.entries(districtToStates)
      .filter(([_, states]) => states.length > 1)
      .map(([d, states]) => `${d}: ${states.join(', ')}`);

    expect(duplicates).toEqual([]);
  });

  it('ensures no district is duplicated within any state', () => {
    for (const [state, districts] of Object.entries(INDIAN_STATES_AND_DISTRICTS)) {
      const set = new Set(districts);
      expect(set.size).toBe(districts.length);
    }
  });

  it('retrieves sorted districts for a given state', () => {
    const tnDistricts = getDistrictsForState('Tamil Nadu');
    expect(tnDistricts.length).toBe(38);
    expect(tnDistricts).toContain('Chennai');
    expect(tnDistricts).toContain('Madurai');
    expect(tnDistricts).toContain('Coimbatore');

    const mhDistricts = getDistrictsForState('Maharashtra');
    expect(mhDistricts.length).toBe(36);
    expect(mhDistricts).toContain('Pune');
    expect(mhDistricts).toContain('Mumbai City');
  });

  it('detects state and district from reverse geocoded address string', () => {
    const res1 = detectStateAndDistrict('Anna Salai, Guindy, Chennai, Tamil Nadu, 600025, India');
    expect(res1.state).toBe('Tamil Nadu');
    expect(res1.district).toBe('Chennai');

    const res2 = detectStateAndDistrict('Kothrud, Pune, Maharashtra, 411038, India');
    expect(res2.state).toBe('Maharashtra');
    expect(res2.district).toBe('Pune');
  });

  it('detects state and district from structured Nominatim address objects', () => {
    // Real Nominatim structure for Chennai
    const nominatimChennai = {
      display_name: 'Raja Muthiah Road, Periamet, Ward 58, Zone 5 Royapuram, Chennai Corporation, Chennai, Tamil Nadu, 600001, India',
      address: {
        city: 'Chennai Corporation',
        state_district: 'Chennai',
        state: 'Tamil Nadu',
        country: 'India',
      },
    };
    const res1 = detectStateAndDistrict(nominatimChennai.display_name, nominatimChennai.address);
    expect(res1.state).toBe('Tamil Nadu');
    expect(res1.district).toBe('Chennai');

    // Real Nominatim structure with 'District' suffix
    const nominatimErode = {
      display_name: 'Salem Road, Perundurai, Erode, Tamil Nadu, 638052, India',
      address: {
        town: 'Perundurai',
        state_district: 'Erode District',
        state: 'Tamil Nadu',
      },
    };
    const res2 = detectStateAndDistrict(nominatimErode.display_name, nominatimErode.address);
    expect(res2.state).toBe('Tamil Nadu');
    expect(res2.district).toBe('Erode');

    // Real Nominatim structure for NCT Delhi
    const nominatimDelhi = {
      display_name: 'Connaught Place, New Delhi, National Capital Territory of Delhi, 110001, India',
      address: {
        county: 'New Delhi',
        state: 'National Capital Territory of Delhi',
      },
    };
    const res3 = detectStateAndDistrict(nominatimDelhi.display_name, nominatimDelhi.address);
    expect(res3.state).toBe('Delhi');
    expect(res3.district).toBe('New Delhi');
  });
});
