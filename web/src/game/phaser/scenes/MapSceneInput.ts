import Phaser from 'phaser';
import type { GameController } from '../../controller/GameController';
import type { ClientState } from '../../types/clientState';
import { TILE_HALF_HEIGHT, TILE_HALF_WIDTH } from '../assets/constants';
import { screenToWorld } from './MapSceneCamera';

export class MapSceneInput {
  private lastLeftClickTime = 0;
  private lastLeftClickKey = '';
  private rightButtonDownThisFrame = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly controller: GameController,
    private readonly getLatestState: () => ClientState | null,
    private readonly isAnimating: () => boolean,
  ) {}

  setup(): void {
    this.scene.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (!event.shiftKey) return;
      const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (!arrowKeys.includes(event.key)) return;
      event.preventDefault();
      const nextId = this.controller.getNextAvailableUnit();
      if (nextId) this.controller.dispatch({ type: 'select_unit', unitId: nextId });
    });

    this.scene.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      const state = this.getLatestState();
      const currentZoom = state?.camera.zoom ?? 1;
      const nextZoom = Phaser.Math.Clamp(currentZoom - dy * 0.001, 0.45, 1.65);
      this.scene.cameras.main.setZoom(nextZoom);
      this.controller.setZoom(nextZoom);
    });

    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.rightButtonDownThisFrame = pointer.event instanceof MouseEvent && pointer.event.button === 2;
    });

    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.rightButtonDownThisFrame) {
        this.handleRightClick(pointer);
      }
      this.rightButtonDownThisFrame = false;
    });

    this.scene.input.mouse?.disableContextMenu();

    const canvas = this.scene.game.canvas as HTMLCanvasElement;
    if (canvas) {
      canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
      }, { capture: true, passive: false });
    }

    this.scene.input.keyboard?.on('keydown-A', () => this.handleToggleAttackMode());
    this.scene.input.keyboard?.on('keydown-ESC', () => this.handleEscape());
    this.scene.input.keyboard?.on('keydown-ENTER', () => this.handleEndTurn());
    this.scene.input.keyboard?.on('keydown-B', () => this.handleBuildCity());
  }

  private handleToggleAttackMode(): void {
    const state = this.getLatestState();
    const selectedUnitId = state?.selected?.type === 'unit' ? state.selected.unitId : null;
    const activeUnitId = state?.actions.selectedUnitId ?? selectedUnitId;
    if (!state || state.mode !== 'play' || !activeUnitId) {
      return;
    }

    this.controller.dispatch({
      type: 'set_targeting_mode',
      mode: state.actions.targetingMode === 'attack' ? 'move' : 'attack',
    });
  }

  private handleEscape(): void {
    const state = this.getLatestState();
    if (!state || state.mode !== 'play') {
      return;
    }

    if (state.actions.targetingMode === 'attack') {
      this.controller.dispatch({ type: 'set_targeting_mode', mode: 'move' });
      return;
    }

    if (state.actions.queuedUnitId) {
      this.controller.dispatch({ type: 'cancel_queue', unitId: state.actions.queuedUnitId });
      return;
    }

    this.controller.dispatch({ type: 'select_hex', q: -1, r: -1 });
  }

  private handleEndTurn(): void {
    const state = this.getLatestState();
    if (!state || state.mode !== 'play') {
      return;
    }

    this.controller.dispatch({ type: 'end_turn' });
  }

  private handleBuildCity(): void {
    const state = this.getLatestState();
    const selectedUnitId = state?.selected?.type === 'unit' ? state.selected.unitId : null;
    const activeUnitId = state?.actions.selectedUnitId ?? selectedUnitId;
    const unit = activeUnitId ? state?.world.units.find((entry) => entry.id === activeUnitId) : null;
    if (!state || state.mode !== 'play' || !activeUnitId || !unit?.isSettler || !unit.isActiveFaction) {
      return;
    }

    this.controller.dispatch({ type: 'build_city', unitId: activeUnitId });
  }

  private handleRightClick(pointer: Phaser.Input.Pointer): void {
    if (this.isAnimating()) return;

    const state = this.getLatestState();
    if (!state || state.mode !== 'play') {
      return;
    }

    const coord = screenToWorld(pointer.worldX, pointer.worldY + 8);
    if (!coord) {
      return;
    }

    const key = `${coord.q},${coord.r}`;
    const selectedUnitId = state.actions.selectedUnitId;
    const clickedUnit = state.world.units.find((u) => u.q === coord.q && u.r === coord.r);

    if (clickedUnit && !clickedUnit.isActiveFaction && selectedUnitId) {
      const attackTarget = state.actions.attackTargets.find((t) => t.unitId === clickedUnit.id);
      if (attackTarget) {
        this.controller.dispatch({
          type: 'attack_unit',
          attackerId: selectedUnitId,
          defenderId: clickedUnit.id,
        });
        return;
      }
      this.controller.dispatch({
        type: 'queue_move',
        unitId: selectedUnitId,
        destination: { q: coord.q, r: coord.r },
      });
      return;
    }

    if (clickedUnit && clickedUnit.isActiveFaction) {
      this.controller.dispatch({ type: 'select_unit', unitId: clickedUnit.id });
      return;
    }

    if (selectedUnitId) {
      const target = state.actions.legalMoves.find((hex) => hex.key === key);
      if (target) {
        this.controller.dispatch({
          type: 'move_unit',
          unitId: selectedUnitId,
          destination: { q: target.q, r: target.r },
        });
        return;
      }

      const clickedHex = state.world.map.hexes.find((h) => h.key === key);
      if (clickedHex && (clickedHex.visibility === 'visible' || clickedHex.visibility === 'explored')) {
        this.controller.dispatch({
          type: 'queue_move',
          unitId: selectedUnitId,
          destination: { q: coord.q, r: coord.r },
        });
        return;
      }
    }

    if (!selectedUnitId) {
      this.controller.dispatch({ type: 'select_hex', q: coord.q, r: coord.r });
    } else {
      this.controller.dispatch({ type: 'select_hex', q: -1, r: -1 });
    }
  }

  handleHexClick(state: ClientState, q: number, r: number, pointer?: Phaser.Input.Pointer): void {
    if (this.isAnimating()) return;
    if (MapSceneInput.isRightClick(pointer)) return;

    if (MapSceneInput.isCtrlClick(pointer)) {
      this.controller.dispatch({ type: 'inspect_terrain', q, r });
      return;
    }

    const key = `${q},${r}`;
    const selectedUnitId = state.actions.selectedUnitId;
    const attackTarget = state.actions.attackTargets.find((target) => target.key === key) ?? null;
    const clickedUnit = state.world.units.find((unit) => unit.q === q && unit.r === r);

    if (clickedUnit && this.isDoubleClick(key)) {
      const city = state.world.cities.find((c) => c.q === q && c.r === r);
      if (city) {
        this.controller.dispatch({ type: 'select_city', cityId: city.id });
        return;
      }
    }

    if (state.mode === 'play' && clickedUnit?.isActiveFaction) {
      this.controller.dispatch({ type: 'select_unit', unitId: clickedUnit.id });
      return;
    }

    if (state.mode === 'play' && selectedUnitId && state.actions.targetingMode === 'attack' && attackTarget) {
      this.controller.dispatch({
        type: 'attack_unit',
        attackerId: selectedUnitId,
        defenderId: attackTarget.unitId,
      });
      return;
    }

    this.controller.dispatch({ type: 'select_hex', q: -1, r: -1 });
  }

  handleUnitSelection(state: ClientState, unitId: string, pointer?: Phaser.Input.Pointer): void {
    if (this.isAnimating()) return;
    if (MapSceneInput.isRightClick(pointer)) return;

    const unit = state.world.units.find((entry) => entry.id === unitId);
    if (!unit) {
      return;
    }

    if (MapSceneInput.isCtrlClick(pointer)) {
      this.controller.dispatch({ type: 'inspect_terrain', q: unit.q, r: unit.r });
      return;
    }

    const city = state.world.cities.find((c) => c.q === unit.q && c.r === unit.r);
    if (city && this.isDoubleClick(unitId)) {
      this.controller.dispatch({ type: 'select_city', cityId: city.id });
      return;
    }

    this.controller.dispatch({ type: 'select_unit', unitId });
  }

  handleCitySelection(state: ClientState, cityId: string, pointer?: Phaser.Input.Pointer): void {
    if (this.isAnimating()) return;
    if (MapSceneInput.isRightClick(pointer)) return;

    const city = state.world.cities.find((entry) => entry.id === cityId);
    if (!city) {
      return;
    }

    if (MapSceneInput.isCtrlClick(pointer)) {
      this.controller.dispatch({ type: 'inspect_terrain', q: city.q, r: city.r });
      return;
    }

    if (this.isDoubleClick(`${city.q},${city.r}`)) {
      this.controller.dispatch({ type: 'select_city', cityId });
      return;
    }

    const occupyingUnit = state.world.units.find((unit) => unit.q === city.q && unit.r === city.r && unit.isActiveFaction);
    if (occupyingUnit) {
      const screenPos = { x: (city.q - city.r) * TILE_HALF_WIDTH, y: (city.q + city.r) * TILE_HALF_HEIGHT };
      window.openHoverSelect?.(screenPos.x, screenPos.y + 20, { id: occupyingUnit.id, name: occupyingUnit.prototypeName }, { id: city.id, name: city.name });
      return;
    }

    this.controller.dispatch({ type: 'select_city', cityId });
  }

  handleVillageSelection(state: ClientState, villageId: string, pointer?: Phaser.Input.Pointer): void {
    if (this.isAnimating()) return;
    if (MapSceneInput.isRightClick(pointer)) return;

    const village = state.world.villages.find((entry) => entry.id === villageId);
    if (!village) {
      return;
    }

    if (MapSceneInput.isCtrlClick(pointer)) {
      this.controller.dispatch({ type: 'inspect_terrain', q: village.q, r: village.r });
      return;
    }

    this.controller.dispatch({ type: 'select_village', villageId });
  }

  private isDoubleClick(key: string): boolean {
    const now = performance.now();
    const isDbl = now - this.lastLeftClickTime < 400 && this.lastLeftClickKey === key;
    this.lastLeftClickTime = now;
    this.lastLeftClickKey = key;
    return isDbl;
  }

  static isRightClick(pointer?: Phaser.Input.Pointer): boolean {
    return pointer?.event instanceof MouseEvent && pointer.event.button === 2;
  }

  static isCtrlClick(pointer?: Phaser.Input.Pointer): boolean {
    if (!(pointer?.event instanceof MouseEvent)) return false;
    return pointer.event.ctrlKey || pointer.event.metaKey;
  }
}
