import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getCatalogItem, getCatalogByType, getShopCatalog } from '../lib/agentville/catalog.js';

describe('wall_clock_basic catalog entry', () => {
  it('exists in catalog as a decoration with price 0', () => {
    const item = getCatalogItem('wall_clock_basic');
    assert.ok(item, 'wall_clock_basic should exist in catalog');
    assert.equal(item.type, 'decoration');
    assert.equal(item.price, 0);
    assert.equal(item.w, 1);
    assert.equal(item.h, 1);
  });

  it('is marked as hidden', () => {
    const item = getCatalogItem('wall_clock_basic');
    assert.ok(item, 'wall_clock_basic should exist in catalog');
    assert.equal(item.hidden, true);
  });

  it('has no multiplierBonus', () => {
    const item = getCatalogItem('wall_clock_basic');
    assert.ok(item, 'wall_clock_basic should exist in catalog');
    assert.equal(item.multiplierBonus, 0);
  });

  it('is excluded from shop results', () => {
    const decorations = getShopCatalog('decoration');
    const clock = decorations.find(i => i.catalogId === 'wall_clock_basic');
    assert.equal(clock, undefined, 'hidden items should not appear in shop results');
  });

  it('non-hidden decorations still appear in shop results', () => {
    const decorations = getShopCatalog('decoration');
    assert.ok(decorations.length > 0, 'should have at least one non-hidden decoration');
    const plant = decorations.find(i => i.catalogId === 'deco_plant');
    assert.ok(plant, 'deco_plant should still appear');
  });

  it('getCatalogByType still includes hidden items for internal use', () => {
    const allDecorations = getCatalogByType('decoration');
    const clock = allDecorations.find(i => i.catalogId === 'wall_clock_basic');
    assert.ok(clock, 'getCatalogByType should include hidden items');
  });
});
