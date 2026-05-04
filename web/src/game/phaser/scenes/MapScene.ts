import Phaser from 'phaser';
import type { GameController } from '../../controller/GameController';
import type { ClientState } from '../../types/clientState';
import type { UnitView } from '../../types/worldView';
import { TILE_HALF_HEIGHT, TILE_HALF_WIDTH } from '../assets/keys';
import { BorderRenderer } from '../systems/BorderRenderer';
import { CombatAnimator } from '../systems/CombatAnimator';
import { FogRenderer } from '../systems/FogRenderer';
import { ImprovementRenderer } from '../systems/ImprovementRenderer';
import { PathRenderer } from '../systems/PathRenderer';
import { SelectionRenderer } from '../systems/SelectionRenderer';
import { SettlementRenderer } from '../systems/SettlementRenderer';
import { TileLayerRenderer } from '../systems/TileLayerRenderer';
import { UnitRenderer } from '../systems/UnitRenderer';
import { MapSceneCamera, worldToScreen } from './MapSceneCamera';
import { MapSceneInput } from './MapSceneInput';

export class MapScene extends Phaser.Scene {
  private unsubscribe: (() => void) | null = null;
  private tileLayer!: Phaser.GameObjects.Container;
  private borderLayer!: Phaser.GameObjects.Container;
  private settlementLayer!: Phaser.GameObjects.Container;
  private improvementLayer!: Phaser.GameObjects.Container;
  private pathLayer!: Phaser.GameObjects.Container;
  private unitLayer!: Phaser.GameObjects.Container;
  private combatOverlayLayer!: Phaser.GameObjects.Container;
  private selectionLayer!: Phaser.GameObjects.Container;
  private fogLayer!: Phaser.GameObjects.Container;
  private combatAnimator!: CombatAnimator;
  private tileRenderer!: TileLayerRenderer;
  private borderRenderer!: BorderRenderer;
  private settlementRenderer!: SettlementRenderer;
  private improvementRenderer!: ImprovementRenderer;
  private unitRenderer!: UnitRenderer;
  private pathRenderer!: PathRenderer;
  private selectionRenderer!: SelectionRenderer;
  private fogRenderer!: FogRenderer;
  private dragOrigin: { x: number; y: number } | null = null;
  private latestState: ClientState | null = null;
  private cameraManager!: MapSceneCamera;
  private inputHandler!: MapSceneInput;

  constructor(private readonly controller: GameController) {
    super('MapScene');
  }

  create() {
    this.cameras.main.setBackgroundColor('#17130e');

    this.tileLayer = this.add.container().setDepth(0);
    this.borderLayer = this.add.container().setDepth(1);
    this.settlementLayer = this.add.container().setDepth(2);
    this.improvementLayer = this.add.container().setDepth(3);
    this.pathLayer = this.add.container().setDepth(4);
    this.unitLayer = this.add.container().setDepth(5);
    this.combatOverlayLayer = this.add.container().setDepth(6);
    this.selectionLayer = this.add.container().setDepth(7);
    this.fogLayer = this.add.container().setDepth(8);

    this.tileRenderer = new TileLayerRenderer(this, this.tileLayer, this.worldToScreenFn);
    this.borderRenderer = new BorderRenderer(this, this.borderLayer, this.worldToScreenFn);
    this.settlementRenderer = new SettlementRenderer(this, this.settlementLayer, this.worldToScreenFn);
    this.improvementRenderer = new ImprovementRenderer(this, this.improvementLayer, this.worldToScreenFn);
    this.unitRenderer = new UnitRenderer(this, this.unitLayer, this.worldToScreenFn);
    this.combatAnimator = new CombatAnimator(this, this.worldToScreenFn);
    this.pathRenderer = new PathRenderer(this, this.pathLayer, this.worldToScreenFn);
    this.selectionRenderer = new SelectionRenderer(this, this.selectionLayer, this.worldToScreenFn);
    this.fogRenderer = new FogRenderer(this, this.fogLayer, this.worldToScreenFn);

    this.cameraManager = new MapSceneCamera(this.cameras.main, this.worldToScreenFn);
    this.inputHandler = new MapSceneInput(this, this.controller, () => this.latestState, () => this.combatAnimator.isAnimating());
    this.inputHandler.setup();

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.dragOrigin || !pointer.isDown) {
        return;
      }
      const camera = this.cameras.main;
      camera.scrollX -= (pointer.x - this.dragOrigin.x) / camera.zoom;
      camera.scrollY -= (pointer.y - this.dragOrigin.y) / camera.zoom;
      this.dragOrigin = { x: pointer.x, y: pointer.y };
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragOrigin = { x: pointer.x, y: pointer.y };
    });

    this.unsubscribe = this.controller.subscribe(() => this.renderFromState(this.controller.getState()));
    this.renderFromState(this.controller.getState());
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      this.cameraManager.handleResize(gameSize.width, gameSize.height);
    }, this);
  }

  shutdown() {
    this.unsubscribe?.();
    this.scale.off('resize');
  }

  private readonly worldToScreenFn = (q: number, r: number) => worldToScreen(q, r);

  private renderFromState(state: ClientState) {
    this.latestState = state;

    this.tileRenderer.render(state.world, state, {
      onHexSelected: (q, r, pointer) => this.inputHandler.handleHexClick(state, q, r, pointer),
      onHexHovered: (key) => this.controller.setHoveredHex(key),
    });

    this.borderRenderer.render(state.world);

    this.settlementRenderer.render(state.world, {
      onCitySelected: (cityId, pointer) => this.inputHandler.handleCitySelection(state, cityId, pointer),
      onVillageSelected: (villageId, pointer) => this.inputHandler.handleVillageSelection(state, villageId, pointer),
    });

    this.improvementRenderer.render(state.world);

    this.pathRenderer.render(state.world);

    this.unitRenderer.render(state.world, state, {
      onUnitSelected: (unitId, pointer) => this.inputHandler.handleUnitSelection(state, unitId, pointer),
      skipUnitIds: this.combatAnimator.getAnimatedUnitIds(),
    });

    this.selectionRenderer.render(
      state.world,
      state.selected,
      state.inspectedTerrain ? `${state.inspectedTerrain.q},${state.inspectedTerrain.r}` : null,
      state.hoveredHex ? `${state.hoveredHex.q},${state.hoveredHex.r}` : null,
    );
    this.fogRenderer.render(state.world);

    this.cameraManager.layout(state);
  }

  /** Called by GameController/GameShell to start a combat animation */
  startCombatAnimation(
    data: import('../systems/CombatAnimator').CombatAnimData,
    attackerView: UnitView,
    defenderView: UnitView,
    onComplete: () => void,
    skipAnimation = false,
    aiInitiated = false,
  ): void {
    if (aiInitiated && !skipAnimation) {
      this.cameraManager.panToMidpoint(
        attackerView.q, attackerView.r,
        defenderView.q, defenderView.r,
        350,
      );

      this.cameras.main.once('camerapancomplete', () => {
        this.combatAnimator.playCombat(data, attackerView, defenderView, onComplete, skipAnimation);
      });
    } else {
      this.combatAnimator.playCombat(data, attackerView, defenderView, onComplete, skipAnimation);
    }
  }

  isCombatAnimating(): boolean {
    return this.combatAnimator.isAnimating();
  }

  cancelCombatAnimation(): void {
    this.cameraManager.resetFX();
    this.combatAnimator.cancel();
  }
}
