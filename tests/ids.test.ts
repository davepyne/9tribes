import {
  createFactionId,
  createUnitId,
  createCityId,
  createPrototypeId,
  createImprovementId,
  createChassisId,
  createComponentId,
  createResearchNodeId,
  _resetIdCounter,
} from '../src/core/ids';

describe('ID factories', () => {
  beforeEach(() => {
    _resetIdCounter(0);
  });

  it('creates faction IDs with correct prefix', () => {
    const id = createFactionId();
    expect(id).toMatch(/^faction_\d+$/);
  });

  it('creates unit IDs with correct prefix', () => {
    const id = createUnitId();
    expect(id).toMatch(/^unit_\d+$/);
  });

  it('creates city IDs with correct prefix', () => {
    const id = createCityId();
    expect(id).toMatch(/^city_\d+$/);
  });

  it('creates prototype IDs with correct prefix', () => {
    const id = createPrototypeId();
    expect(id).toMatch(/^prototype_\d+$/);
  });

  it('creates improvement IDs with correct prefix', () => {
    const id = createImprovementId();
    expect(id).toMatch(/^improvement_\d+$/);
  });

  it('creates chassis IDs with correct prefix', () => {
    const id = createChassisId();
    expect(id).toMatch(/^chassis_\d+$/);
  });

  it('creates component IDs with correct prefix', () => {
    const id = createComponentId();
    expect(id).toMatch(/^component_\d+$/);
  });

  it('creates research node IDs with correct prefix', () => {
    const id = createResearchNodeId();
    expect(id).toMatch(/^research_\d+$/);
  });
});

describe('ID counter increment', () => {
  beforeEach(() => {
    _resetIdCounter(0);
  });

  it('increments counter for each generated ID', () => {
    const id1 = createUnitId();
    const id2 = createUnitId();
    const id3 = createUnitId();
    
    expect(id1).toBe('unit_1');
    expect(id2).toBe('unit_2');
    expect(id3).toBe('unit_3');
  });

  it('shares counter across all ID types', () => {
    const factionId = createFactionId();
    const unitId = createUnitId();
    const cityId = createCityId();
    
    expect(factionId).toBe('faction_1');
    expect(unitId).toBe('unit_2');
    expect(cityId).toBe('city_3');
  });
});

describe('ID with explicit value', () => {
  it('uses provided value instead of generating', () => {
    const id = createUnitId('custom_id');
    expect(id).toBe('custom_id');
  });

  it('does not increment counter when using explicit value', () => {
    _resetIdCounter(0);
    createUnitId('custom_id');
    const nextId = createUnitId();

    expect(nextId).toBe('unit_1');
  });
});
