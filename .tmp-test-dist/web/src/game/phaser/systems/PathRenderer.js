export class PathRenderer {
    scene;
    layer;
    worldToScreen;
    constructor(scene, layer, worldToScreen) {
        this.scene = scene;
        this.layer = layer;
        this.worldToScreen = worldToScreen;
    }
    render(world) {
        this.layer.removeAll(true);
        for (const hex of world.overlays.reachableHexes) {
            const point = this.worldToScreen(hex.q, hex.r);
            const ring = this.scene.add.ellipse(point.x, point.y - 8, 62, 28, 0x5ec7a0, 0.28)
                .setStrokeStyle(3, 0xb8ffe4, 0.95);
            this.layer.add(ring);
        }
        for (const hex of world.overlays.attackHexes) {
            const point = this.worldToScreen(hex.q, hex.r);
            const ring = this.scene.add.ellipse(point.x, point.y - 8, 62, 28, 0xb84242, 0.26)
                .setStrokeStyle(3, 0xffb2a7, 0.95);
            this.layer.add(ring);
        }
        if (world.overlays.lastMove) {
            const point = this.worldToScreen(world.overlays.lastMove.destination.q, world.overlays.lastMove.destination.r);
            const marker = this.scene.add.ellipse(point.x, point.y - 8, 68, 32, 0xf2d67b, 0.08)
                .setStrokeStyle(3, 0xf2d67b, 0.95);
            this.layer.add(marker);
        }
        if (world.overlays.pathPreview.length < 2) {
            return;
        }
        const graphics = this.scene.add.graphics();
        graphics.lineStyle(6, 0xf2d67b, 0.92);
        for (let index = 0; index < world.overlays.pathPreview.length - 1; index += 1) {
            const current = world.overlays.pathPreview[index];
            const next = world.overlays.pathPreview[index + 1];
            const from = this.worldToScreen(current.q, current.r);
            const to = this.worldToScreen(next.q, next.r);
            graphics.lineBetween(from.x, from.y - 8, to.x, to.y - 8);
        }
        this.layer.add(graphics);
        for (const node of world.overlays.pathPreview) {
            const point = this.worldToScreen(node.q, node.r);
            const marker = this.scene.add.ellipse(point.x, point.y - 8, node.step === 0 ? 18 : 14, node.step === 0 ? 10 : 8, 0xf7e7a8, node.step === 0 ? 0.78 : 0.9)
                .setStrokeStyle(2, 0xfff4c8, 0.95);
            this.layer.add(marker);
        }
    }
}
