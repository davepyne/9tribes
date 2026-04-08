import Phaser from 'phaser';
import type { UnitView } from '../../types/worldView';
import { getUnitTextureSpec, getUnitRearTextureSpec } from '../assets/keys';

export interface CombatAnimData {
  attackerDamage: number;
  defenderDamage: number;
  attackerDestroyed: boolean;
  defenderDestroyed: boolean;
  attackerRouted: boolean;
  defenderRouted: boolean;
  attackerFled: boolean;
  defenderFled: boolean;
}

type ActiveAnimation = {
  tweens: Phaser.Tweens.Tween[];
  sprites: Phaser.GameObjects.GameObject[];
  unitIds: [string, string];
};

export class CombatAnimator {
  private overlayLayer: Phaser.GameObjects.Container;
  private active: ActiveAnimation | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly worldToScreen: (q: number, r: number) => { x: number; y: number },
  ) {
    this.overlayLayer = scene.add.container();
    this.overlayLayer.setDepth(100);
    this.overlayLayer.setVisible(false);
  }

  getOverlayLayer(): Phaser.GameObjects.Container {
    return this.overlayLayer;
  }

  isAnimating(): boolean {
    return this.active !== null;
  }

  getAnimatedUnitIds(): Set<string> {
    if (!this.active) return new Set();
    return new Set(this.active.unitIds);
  }

  playCombat(
    data: CombatAnimData,
    attackerView: UnitView,
    defenderView: UnitView,
    onComplete: () => void,
    skipAnimation = false,
  ): void {
    if (skipAnimation) {
      this.playInstant(data, attackerView, defenderView, onComplete);
      return;
    }

    this.cancel();

    const attPos = this.worldToScreen(attackerView.q, attackerView.r);
    const defPos = this.worldToScreen(defenderView.q, defenderView.r);

    this.overlayLayer.removeAll(true);
    this.overlayLayer.setAlpha(1);
    this.overlayLayer.setVisible(true);

    const allSprites: Phaser.GameObjects.GameObject[] = [];
    const allTweens: Phaser.Tweens.Tween[] = [];

    // Clone sprites
    const attSprite = this.cloneSprite(attackerView, attPos.x, attPos.y);
    const defSprite = this.cloneSprite(defenderView, defPos.x, defPos.y);
    allSprites.push(attSprite, defSprite);

    // Faction markers
    const attMarker = this.scene.add.ellipse(attPos.x, attPos.y - 8, 38, 22, this.getFactionColor(attackerView), 0.66);
    const defMarker = this.scene.add.ellipse(defPos.x, defPos.y - 8, 38, 22, this.getFactionColor(defenderView), 0.66);
    allSprites.push(attMarker, defMarker);

    // HP bars
    const attHpBar = this.createHpBar(attPos, attackerView.hp, attackerView.maxHp);
    const defHpBar = this.createHpBar(defPos, defenderView.hp, defenderView.maxHp);
    allSprites.push(attHpBar.track, attHpBar.fill, defHpBar.track, defHpBar.fill);

    // Animation constants (needed early for attacker damage text positioning)
    const chargeRatio = 0.55;
    const midX = attPos.x + (defPos.x - attPos.x) * chargeRatio;
    const midY = attPos.y + (defPos.y - attPos.y) * chargeRatio;

    // Damage text — attacker's placed at charged position since it hasn't retreated yet
    const defDmgText = this.createDamageText(defPos, data.defenderDamage);
    allSprites.push(defDmgText);
    const attDmgText = data.attackerDamage > 0 ? this.createDamageText({ x: midX, y: midY }, data.attackerDamage) : null;
    if (attDmgText) allSprites.push(attDmgText);

    // Add ALL created sprites to the overlay layer so cleanup() can remove them.
    for (const obj of allSprites) {
      this.overlayLayer.add(obj);
    }

    // Helper to create a tween and track it
    const addTween = (config: Phaser.Types.Tweens.TweenBuilderConfig) => {
      const tween = this.scene.tweens.add(config);
      allTweens.push(tween);
      return tween;
    };

    // === PHASE 1: Charge-in (0-400ms) ===
    addTween({
      targets: attSprite,
      x: midX, y: midY - (attSprite.displayHeight * 0.15), // approximate yOffset
      duration: 350,
      ease: 'Quad.easeOut',
    });
    addTween({
      targets: attMarker,
      x: midX, y: midY - 8,
      duration: 350,
      ease: 'Quad.easeOut',
    });
    addTween({
      targets: [attHpBar.track, attHpBar.fill],
      x: midX, y: midY + 4,
      duration: 350,
      ease: 'Quad.easeOut',
    });

    // === PHASE 2: Clash / shake (350-700ms) ===
    addTween({
      targets: [attSprite, defSprite],
      alpha: 0.4,
      duration: 50,
      yoyo: true,
      repeat: 3,
      delay: 350,
    });
    addTween({
      targets: attSprite,
      x: midX + 3, y: midY - 2 - (attSprite.displayHeight * 0.15),
      duration: 60,
      yoyo: true,
      repeat: 5,
      delay: 380,
    });
    addTween({
      targets: defSprite,
      x: defPos.x - 4, y: defPos.y + 2 - (defSprite.displayHeight * 0.15),
      duration: 60,
      yoyo: true,
      repeat: 5,
      delay: 400,
    });

    // === PHASE 3: Strike (defender damage) then Retaliation (attacker damage) ===
    const defFinalHp = Math.max(0, defenderView.hp - data.defenderDamage);
    const attFinalHp = Math.max(0, attackerView.hp - data.attackerDamage);

    // 3a: Attacker's STRIKE — defender damage appears at clash moment
    addTween({
      targets: defDmgText,
      alpha: 1,
      y: defPos.y - 50,
      duration: 800,
      delay: 400,
      onStart: () => { defDmgText.setVisible(true); },
    });

    // 3b: Defender's RETALIATION — attacker damage appears clearly after strike
    if (attDmgText) {
      // Small counter-shake on attacker to visualise retaliation landing
      addTween({
        targets: attSprite,
        x: midX - 3, y: midY + 2 - (attSprite.displayHeight * 0.15),
        duration: 50,
        yoyo: true,
        repeat: 2,
        delay: 680,
      });
      addTween({
        targets: attDmgText,
        alpha: 1,
        y: midY - 50,
        duration: 800,
        delay: 720,
        onStart: () => { attDmgText.setVisible(true); },
      });
    }

    // === PHASE 4: HP bars drain — staggered to match strike → retaliation ===
    const defFinalRatio = defenderView.maxHp > 0 ? defFinalHp / defenderView.maxHp : 0;
    const attFinalRatio = attackerView.maxHp > 0 ? attFinalHp / attackerView.maxHp : 0;

    // Defender HP drains first (strike damage)
    addTween({
      targets: defHpBar.fill,
      scaleX: Math.max(0.06, defFinalRatio),
      duration: 500,
      delay: 450,
      onUpdate: () => {
        const ratio = defHpBar.fill.scaleX;
        (defHpBar.fill as Phaser.GameObjects.Rectangle).setFillStyle(
          ratio < 0.35 ? 0xe05b3f : 0x8fd694, 0.95,
        );
      },
    });
    // Attacker HP drains second (retaliation damage)
    addTween({
      targets: attHpBar.fill,
      scaleX: Math.max(0.06, attFinalRatio),
      duration: 500,
      delay: 770,
      onUpdate: () => {
        const ratio = attHpBar.fill.scaleX;
        (attHpBar.fill as Phaser.GameObjects.Rectangle).setFillStyle(
          ratio < 0.35 ? 0xe05b3f : 0x8fd694, 0.95,
        );
      },
    });

    // === PHASE 5: Outcome (1200-1800ms) ===
    // Distinguish DESTROYED (unit removed from map) from ROUTED/FLED (survives but broken)
    // Previously these were conflated, making routed units look like they were killed/absorbed
    const defenderDead = data.defenderDestroyed;
    const defenderRan = !defenderDead && (data.defenderRouted || data.defenderFled);
    const attackerDead = data.attackerDestroyed;
    const attackerRan = !attackerDead && (data.attackerRouted || data.attackerFled);

    if (defenderDead && !attackerDead) {
      // Defender KILLED: fade out defender completely, attacker advances into defender's hex
      addTween({
        targets: [defSprite, defMarker, defHpBar.track, defHpBar.fill, defDmgText],
        alpha: 0,
        y: defPos.y + 12,
        duration: 400,
        ease: 'Sine.easeIn',
        delay: 1200,
      });
      addTween({
        targets: attSprite,
        x: defPos.x, y: defPos.y - (attSprite.displayHeight * 0.15),
        duration: 500,
        ease: 'Quad.easeOut',
        delay: 1300,
      });
      addTween({
        targets: attMarker,
        x: defPos.x, y: defPos.y - 8,
        duration: 500,
        ease: 'Quad.easeOut',
        delay: 1300,
      });
      addTween({
        targets: [attHpBar.track, attHpBar.fill],
        x: defPos.x, y: defPos.y + 4,
        duration: 500,
        ease: 'Quad.easeOut',
        delay: 1300,
      });
      if (attDmgText) {
        addTween({ targets: attDmgText, x: defPos.x, duration: 500, delay: 1300 });
      }
    } else if (defenderRan && !attackerDead) {
      // Defender ROUTED/FLED (survives with HP): defender falls back faded, attacker partial advance only
      addTween({
        targets: [defSprite, defMarker, defHpBar.track, defHpBar.fill],
        alpha: 0.2,
        y: defPos.y + 18,
        duration: 500,
        ease: 'Sine.easeIn',
        delay: 1200,
      });
      if (defDmgText) {
        addTween({ targets: defDmgText, alpha: 0, duration: 300, delay: 1200 });
      }
      // Attacker moves partway toward defender (pursuit) but does NOT take the hex
      const pursuitX = attPos.x + (defPos.x - attPos.x) * 0.35;
      const pursuitY = attPos.y + (defPos.y - attPos.y) * 0.35;
      addTween({
        targets: attSprite,
        x: pursuitX, y: pursuitY - (attSprite.displayHeight * 0.15),
        duration: 400,
        ease: 'Quad.easeOut',
        delay: 1250,
      });
      addTween({
        targets: attMarker,
        x: pursuitX, y: pursuitY - 8,
        duration: 400,
        ease: 'Quad.easeOut',
        delay: 1250,
      });
      addTween({
        targets: [attHpBar.track, attHpBar.fill],
        x: pursuitX, y: pursuitY + 4,
        duration: 400,
        ease: 'Quad.easeOut',
        delay: 1250,
      });
      if (attDmgText) {
        addTween({ targets: attDmgText, x: pursuitX, duration: 400, delay: 1250 });
      }
    } else if (attackerDead && !defenderDead) {
      // Attacker KILLED: fade out attacker completely, defender stays
      addTween({
        targets: [attSprite, attMarker, attHpBar.track, attHpBar.fill],
        alpha: 0,
        y: attPos.y + 12,
        duration: 400,
        ease: 'Sine.easeIn',
        delay: 1200,
      });
      if (attDmgText) {
        addTween({ targets: attDmgText, alpha: 0, duration: 300, delay: 1200 });
      }
    } else if (attackerRan && !defenderDead) {
      // Attacker ROUTED/FLED (survives with HP): attacker falls back faded
      addTween({
        targets: [attSprite, attMarker, attHpBar.track, attHpBar.fill],
        alpha: 0.2,
        y: attPos.y + 18,
        duration: 500,
        ease: 'Sine.easeIn',
        delay: 1200,
      });
      if (attDmgText) {
        addTween({ targets: attDmgText, alpha: 0, duration: 300, delay: 1200 });
      }
    } else if (defenderDead || attackerDead) {
      // Both destroyed
      addTween({ targets: allSprites, alpha: 0, duration: 400, delay: 1200 });
    } else {
      // Both survive: attacker retreats
      addTween({
        targets: attSprite,
        x: attPos.x, y: attPos.y - (attSprite.displayHeight * 0.15),
        duration: 450,
        ease: 'Quad.easeIn',
        delay: 1200,
      });
      addTween({
        targets: attMarker,
        x: attPos.x, y: attPos.y - 8,
        duration: 450,
        ease: 'Quad.easeIn',
        delay: 1200,
      });
      addTween({
        targets: [attHpBar.track, attHpBar.fill],
        x: attPos.x, y: attPos.y + 4,
        duration: 450,
        ease: 'Quad.easeIn',
        delay: 1200,
      });
      if (attDmgText) {
        addTween({ targets: attDmgText, x: attPos.x, duration: 450, delay: 1200 });
      }
    }

    // === PHASE 6: Cleanup (1800-2000ms) ===
    const cleanupTween = addTween({
      targets: this.overlayLayer,
      alpha: 0,
      duration: 200,
      delay: 1800,
      onComplete: () => {
        this.cleanup();
        this.active = null;
        onComplete();
      },
    });

    this.active = { tweens: allTweens, sprites: allSprites, unitIds: [attackerView.id, defenderView.id] };
  }

  /** Instant mode: render the final outcome frame for ~150ms, then cleanup. */
  private playInstant(
    data: CombatAnimData,
    attackerView: UnitView,
    defenderView: UnitView,
    onComplete: () => void,
  ): void {
    this.cancel();

    const attPos = this.worldToScreen(attackerView.q, attackerView.r);
    const defPos = this.worldToScreen(defenderView.q, defenderView.r);

    this.overlayLayer.removeAll(true);
    this.overlayLayer.setAlpha(1);
    this.overlayLayer.setVisible(true);

    const allSprites: Phaser.GameObjects.GameObject[] = [];

    // Final HP values
    const defFinalHp = Math.max(0, defenderView.hp - data.defenderDamage);
    const attFinalHp = Math.max(0, attackerView.hp - data.attackerDamage);
    const defFinalRatio = defenderView.maxHp > 0 ? defFinalHp / defenderView.maxHp : 0;
    const attFinalRatio = attackerView.maxHp > 0 ? attFinalHp / attackerView.maxHp : 0;

    // Outcome classification
    const defenderDead = data.defenderDestroyed;
    const defenderRan = !defenderDead && (data.defenderRouted || data.defenderFled);
    const attackerDead = data.attackerDestroyed;
    const attackerRan = !attackerDead && (data.attackerRouted || data.attackerFled);

    // Determine final positions based on outcome
    let attFinalX = attPos.x;
    let attFinalY = attPos.y - (48 * 0.15); // approximate yOffset
    let defFinalX = defPos.x;
    let defFinalY = defPos.y - (48 * 0.15);
    let attAlpha = 1;
    let defAlpha = 1;
    let defMarkerAlpha = 1;
    let attMarkerAlpha = 1;

    if (defenderDead && !attackerDead) {
      // Defender killed — attacker advances into hex
      attFinalX = defPos.x; attFinalY = defPos.y - (48 * 0.15);
      defAlpha = 0; defMarkerAlpha = 0;
    } else if (defenderRan && !attackerDead) {
      // Defender routed/fled — partial pursuit
      attFinalX = attPos.x + (defPos.x - attPos.x) * 0.35;
      attFinalY = attPos.y + (defPos.y - attPos.y) * 0.35 - (48 * 0.15);
      defAlpha = 0.2; defMarkerAlpha = 0.2;
      defFinalY = defPos.y + 18 - (48 * 0.15);
    } else if (attackerDead && !defenderDead) {
      // Attacker killed
      attAlpha = 0; attMarkerAlpha = 0;
      attFinalY = attPos.y + 12 - (48 * 0.15);
    } else if (attackerRan && !defenderDead) {
      // Attacker routed/fled
      attAlpha = 0.2; attMarkerAlpha = 0.2;
      attFinalY = attPos.y + 18 - (48 * 0.15);
    } else if (defenderDead || attackerDead) {
      // Both destroyed
      attAlpha = 0; defAlpha = 0; attMarkerAlpha = 0; defMarkerAlpha = 0;
    }
    // Both survive: positions stay at origin (attacker retreats implicitly)

    // Create sprites at final positions
    const attSprite = this.cloneSprite(attackerView, attFinalX, attFinalY).setAlpha(attAlpha);
    const defSprite = this.cloneSprite(defenderView, defFinalX, defFinalY).setAlpha(defAlpha);
    allSprites.push(attSprite, defSprite);

    // Faction markers at final positions
    const attMarker = this.scene.add.ellipse(attFinalX, attFinalY - 8, 38, 22, this.getFactionColor(attackerView), 0.66 * attMarkerAlpha).setVisible(attMarkerAlpha > 0);
    const defMarker = this.scene.add.ellipse(defFinalX, defFinalY - 8, 38, 22, this.getFactionColor(defenderView), 0.66 * defMarkerAlpha).setVisible(defMarkerAlpha > 0);
    allSprites.push(attMarker, defMarker);

    // HP bars at final values
    const attHpBarPos = { x: attFinalX, y: attFinalY + 4 + (48 * 0.15) };
    const defHpBarPos = { x: defFinalX, y: defFinalY + 4 + (48 * 0.15) };
    const attHpBar = this.createHpBar(attHpBarPos, attFinalHp, attackerView.maxHp);
    const defHpBar = this.createHpBar(defHpBarPos, defFinalHp, defenderView.maxHp);
    // Overwrite fill to exact final ratio with correct color
    const attColor = attFinalRatio < 0.35 ? 0xe05b3f : 0x8fd694;
    const defColor = defFinalRatio < 0.35 ? 0xe05b3f : 0x8fd694;
    (attHpBar.fill as Phaser.GameObjects.Rectangle).setScale(Math.max(0.06, attFinalRatio), 1).setFillStyle(attColor, 0.95);
    (defHpBar.fill as Phaser.GameObjects.Rectangle).setScale(Math.max(0.06, defFinalRatio), 1).setFillStyle(defColor, 0.95);
    allSprites.push(attHpBar.track, attHpBar.fill, defHpBar.track, defHpBar.fill);

    // Damage text at floated position
    const defDmgText = this.createDamageText({ x: defPos.x, y: defPos.y - 50 }, data.defenderDamage).setAlpha(1).setVisible(true);
    allSprites.push(defDmgText);
    if (data.attackerDamage > 0) {
      const attDmgText = this.createDamageText({ x: attPos.x, y: attPos.y - 50 }, data.attackerDamage).setAlpha(1).setVisible(true);
      allSprites.push(attDmgText);
    }

    // Parent everything to overlay layer
    for (const obj of allSprites) {
      this.overlayLayer.add(obj);
    }

    // Show for 150ms then cleanup
    this.active = { tweens: [], sprites: allSprites, unitIds: [attackerView.id, defenderView.id] };

    this.scene.time.delayedCall(150, () => {
      this.cleanup();
      this.active = null;
      onComplete();
    });
  }

  cancel(): void {
    if (this.active) {
      for (const t of this.active.tweens) {
        t.stop();
        t.destroy();
      }
      this.cleanup();
      this.active = null;
    }
  }

  private cleanup(): void {
    this.overlayLayer.removeAll(true);
    this.overlayLayer.setAlpha(1);
    this.overlayLayer.setVisible(false);
  }

  private cloneSprite(unit: UnitView, x: number, y: number): Phaser.GameObjects.Image {
    const dir = ((unit.facing % 8) + 8) % 8;
    const isRearFacing = dir === 0 || dir === 1 || dir === 6 || dir === 7;

    let texture: ReturnType<typeof getUnitTextureSpec>;
    if (isRearFacing) {
      texture = getUnitRearTextureSpec(unit.spriteKey) ?? getUnitTextureSpec(unit.spriteKey);
    } else {
      texture = getUnitTextureSpec(unit.spriteKey);
    }

    const sprite = texture.kind === 'sheet'
      ? this.scene.add.image(x, y - texture.yOffset, texture.texture, texture.frame)
      : this.scene.add.image(x, y - texture.yOffset, texture.texture);
    sprite
      .setOrigin(0.5, 1)
      .setDisplaySize(texture.displayWidth, texture.displayHeight)
      .setAlpha(unit.acted ? 0.58 : 1);

    // Horizontal flip for left-facing directions
    // Front sprite base: faces right/southeast; Rear sprite base: faces left/northwest
    if (dir === 1 || dir === 2 || dir === 5) {
      // NE (rear), E (front), SW (front) — flip to face rightward
      sprite.setFlipX(true);
    } else if (dir === 6) {
      // West — rear sprite faces left by default; keep it
      sprite.setFlipX(false);
    }

    return sprite;
  }

  private createHpBar(
    pos: { x: number; y: number },
    hp: number,
    maxHp: number,
  ): { track: Phaser.GameObjects.Rectangle; fill: Phaser.GameObjects.Rectangle } {
    const ratio = maxHp > 0 ? hp / maxHp : 0;
    const track = this.scene.add.rectangle(pos.x, pos.y + 4, 28, 4, 0x261d15, 0.8).setOrigin(0.5, 0.5);
    const fill = this.scene.add.rectangle(pos.x - 14, pos.y + 4, Math.max(3, 28 * ratio), 4, ratio < 0.35 ? 0xe05b3f : 0x8fd694, 0.95)
      .setOrigin(0, 0.5);
    return { track, fill };
  }

  private createDamageText(
    pos: { x: number; y: number },
    damage: number,
  ): Phaser.GameObjects.Text {
    return this.scene.add.text(pos.x, pos.y + 10, `-${damage}`, {
      fontFamily: 'Inter, sans-serif',
      fontSize: '20px',
      color: '#e05b3f',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setVisible(false).setAlpha(0);
  }

  private getFactionColor(_unit: UnitView): number {
    return 0xd8c7a3;
  }
}
