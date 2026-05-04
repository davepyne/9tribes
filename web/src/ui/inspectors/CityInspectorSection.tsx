import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { CityInspectorViewModel } from '../../game/types/clientState';
import { MetaRow } from './MetaRow';

type CityTab = 'overview' | 'production';

type CityInspectorSectionProps = {
  city: CityInspectorViewModel;
  showRestrictedEnemyCityInfo: boolean;
  onSetCityProduction: (cityId: string, prototypeId: string) => void;
  onCancelCityProduction: (cityId: string) => void;
  onRemoveFromQueue: (cityId: string, queueIndex: number) => void;
  onReorderQueue: (cityId: string, fromIndex: number, toIndex: number) => void;
};

export const CityInspectorSection = React.memo(function CityInspectorSection({
  city,
  showRestrictedEnemyCityInfo,
  onSetCityProduction,
  onCancelCityProduction,
  onRemoveFromQueue,
  onReorderQueue,
}: CityInspectorSectionProps) {
  const [cityTab, setCityTab] = useState<CityTab>('overview');
  const [draggedQueueIndex, setDraggedQueueIndex] = useState<number | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [tabsCanScrollLeft, setTabsCanScrollLeft] = useState(false);
  const [tabsCanScrollRight, setTabsCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    setTabsCanScrollLeft(el.scrollLeft > 2);
    setTabsCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState]);

  const scrollTabsLeft = useCallback(() => {
    tabsRef.current?.scrollBy({ left: -120, behavior: 'smooth' });
  }, []);

  const scrollTabsRight = useCallback(() => {
    tabsRef.current?.scrollBy({ left: 120, behavior: 'smooth' });
  }, []);

  return (
    <div className="ci-section">
      {!showRestrictedEnemyCityInfo ? (
        <div className="ci-tabs-wrapper">
          {tabsCanScrollLeft && (
            <button type="button" className="ci-tabs-arrow ci-tabs-arrow--left" aria-label="Scroll tabs left" onClick={scrollTabsLeft}>
              ‹
            </button>
          )}
          <div className="ci-tabs" ref={tabsRef} role="tablist">
            {(['overview', 'production'] as CityTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                className={`ci-tab${cityTab === tab ? ' ci-tab--active' : ''}`}
                onClick={() => setCityTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          {tabsCanScrollRight && (
            <button type="button" className="ci-tabs-arrow ci-tabs-arrow--right" aria-label="Scroll tabs right" onClick={scrollTabsRight}>
              ›
            </button>
          )}
        </div>
      ) : null}

      {showRestrictedEnemyCityInfo ? (
        <div className="ci-tab-content">
          <MetaRow label="Faction">{city.factionName}</MetaRow>
          <MetaRow label="Besieged">{city.walls.besieged ? 'Yes' : 'No'}</MetaRow>
        </div>
      ) : cityTab === 'overview' ? (
        <div className="ci-tab-content">
          <MetaRow label="Faction">{city.factionName}</MetaRow>
          <MetaRow label="Walls">{city.walls.wallHp}/{city.walls.maxWallHp}</MetaRow>
          <MetaRow label="Besieged">{city.walls.besieged ? 'Yes' : 'No'}</MetaRow>
          <MetaRow label="Production Income">{city.production.perTurnIncome}/turn</MetaRow>
          <MetaRow label="Supply Income">{city.supply.income}/turn</MetaRow>
          <MetaRow label="Supply Used">{city.supply.used}/{city.supply.income}</MetaRow>
          <MetaRow label="Turns until next village">
            {city.turnsUntilNextVillage === 0 ? 'Ready' : `${city.turnsUntilNextVillage}`}
          </MetaRow>
          {city.siteBonuses.traits.map((trait) => (
            <MetaRow label={trait.label} key={trait.key}>
              {trait.active ? trait.effect : 'None'}
            </MetaRow>
          ))}
        </div>
      ) : null}

      {!showRestrictedEnemyCityInfo && cityTab === 'production' ? (
        <ProductionQueue
          city={city}
          draggedQueueIndex={draggedQueueIndex}
          setDraggedQueueIndex={setDraggedQueueIndex}
          onSetCityProduction={onSetCityProduction}
          onCancelCityProduction={onCancelCityProduction}
          onRemoveFromQueue={onRemoveFromQueue}
          onReorderQueue={onReorderQueue}
        />
      ) : null}
    </div>
  );
});

type ProductionQueueProps = {
  city: CityInspectorViewModel;
  draggedQueueIndex: number | null;
  setDraggedQueueIndex: (index: number | null) => void;
  onSetCityProduction: (cityId: string, prototypeId: string) => void;
  onCancelCityProduction: (cityId: string) => void;
  onRemoveFromQueue: (cityId: string, queueIndex: number) => void;
  onReorderQueue: (cityId: string, fromIndex: number, toIndex: number) => void;
};

const ProductionQueue = React.memo(function ProductionQueue({
  city,
  draggedQueueIndex,
  setDraggedQueueIndex,
  onSetCityProduction,
  onCancelCityProduction,
  onRemoveFromQueue,
  onReorderQueue,
}: ProductionQueueProps) {
  return (
    <div className="ci-tab-content ci-prod-tab">
      {/* Available Units */}
      <div className="pq-divider">
        <span>{city.canManageProduction ? 'TRAIN' : 'AVAILABLE UNITS'}</span>
      </div>

      {!city.canManageProduction ? (
        <p className="pq-readonly-hint">
          {city.walls.besieged
            ? 'Besieged — production locked'
            : city.isFriendly
              ? 'Only the active city can manage production'
              : 'Enemy city — read only'}
        </p>
      ) : null}

      <div className="pq-unit-list">
        {city.productionOptions.map((option) => (
          <button
            key={option.prototypeId}
            type="button"
            className={`pq-unit-card${option.disabled ? ' pq-unit-card--disabled' : ''}`}
            disabled={option.disabled}
            onClick={() => onSetCityProduction(city.cityId, option.prototypeId)}
          >
            <div className="pq-unit-card__header">
              <span className="pq-unit-card__name">{option.name}</span>
              <span className="pq-unit-card__cost">
                {option.costModifierReason ? (
                  <>
                    <span className="pq-base-cost">{option.baseCost}</span>
                    {option.cost}
                  </>
                ) : option.cost}
                <span className="pq-unit-card__cost-label">prod</span>
              </span>
            </div>
            <div className="pq-unit-card__stats">
              <span className="pq-stat pq-stat--atk">ATK {option.attack}</span>
              <span className="pq-stat pq-stat--def">DEF {option.defense}</span>
              <span className="pq-stat pq-stat--hp">HP {option.hp}</span>
              {option.moves > 1 && <span className="pq-stat pq-stat--mov">MOV {option.moves}</span>}
              {option.range > 1 && <span className="pq-stat pq-stat--rng">RNG {option.range}</span>}
              {!option.isPrototype && <span className="pq-stat pq-stat--sup">SUP {option.supplyCost}</span>}
            </div>
            {option.costModifierReason && (
              <span className="pq-shock-note">{option.costModifierReason}</span>
            )}
          </button>
        ))}
      </div>

      {/* Current Production */}
      {city.production.current ? (
        <div className="pq-current">
          <div className="pq-current__header">
            <span className="pq-current__label">NOW BUILDING</span>
            <span className="pq-cost-badge">
              {city.production.current.costModifierReason ? (
                <>
                  <span className="pq-base-cost">{city.production.current.baseCost}</span>
                  {city.production.current.cost} prod
                </>
              ) : city.production.current.costLabel}
            </span>
            {city.production.current.costModifierReason && (
              <span className="pq-shock-note">{city.production.current.costModifierReason}</span>
            )}
          </div>
          <strong className="pq-current__name">{city.production.current.name}</strong>
          <div className="pq-progress">
            <div
              className="pq-progress__fill"
              style={{ width: `${Math.min(100, (city.production.current.progress / city.production.current.cost) * 100)}%` }}
            />
          </div>
          <div className="pq-current__stats">
            <span>
              {city.production.current.costType === 'villages'
                ? `${city.production.current.progress.toFixed(0)}/${city.production.current.cost} villages`
                : `${city.production.current.progress.toFixed(0)}/${city.production.current.cost}`}
            </span>
            <span>
              {city.production.current.costType === 'villages'
                ? 'paid from villages'
                : `${city.production.perTurnIncome.toFixed(1)}/turn`}
            </span>
            <span>{city.production.current.turnsRemaining === null ? '--' : `${city.production.current.turnsRemaining}t`}</span>
          </div>
          {city.canManageProduction && (
            <button
              type="button"
              className="pq-cancel-btn"
              onClick={() => onCancelCityProduction(city.cityId)}
            >
              Cancel
            </button>
          )}
        </div>
      ) : (
        <div className="pq-idle">
          <span className="pq-idle__dot" />
          Idle — select a unit to begin training
        </div>
      )}

      {/* Queue */}
      {city.production.queue.length > 0 && (
        <div className="pq-queue">
          <div className="pq-queue__header">
            <span className="pq-queue__label">QUEUE</span>
            <span className="pq-queue__count">{city.production.queue.length}</span>
          </div>
          {city.production.queue.map((item, index) => (
            <div
              className={`pq-queue-item${draggedQueueIndex === index ? ' pq-queue-item--dragging' : ''}`}
              key={`${item.type}-${item.id}-${index}`}
              draggable={city.canManageProduction}
              onDragStart={() => setDraggedQueueIndex(index)}
              onDragEnd={() => setDraggedQueueIndex(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (draggedQueueIndex !== null && draggedQueueIndex !== index) {
                  onReorderQueue(city.cityId, draggedQueueIndex, index);
                }
                setDraggedQueueIndex(null);
              }}
            >
              <span className="pq-queue-item__index">{index + 1}</span>
              <span className="pq-queue-item__name">{item.name}</span>
              <span className="pq-queue-item__cost">
                {item.costModifierReason ? (
                  <>
                    <span className="pq-base-cost">{item.baseCost}</span>
                    {item.cost} prod
                  </>
                ) : item.costLabel}
              </span>
              {item.costModifierReason && (
                <span className="pq-shock-note">{item.costModifierReason}</span>
              )}
              {city.canManageProduction && (
                <button
                  type="button"
                  className="pq-queue-item__remove"
                  onClick={() => onRemoveFromQueue(city.cityId, index)}
                  aria-label={`Remove ${item.name} from queue`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
