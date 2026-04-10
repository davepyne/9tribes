import { parseFreecivTagFrameLookup } from '../assets/freelandSpec.js';
import { FREELAND_SPECS, getFogRenderState, getFogTag, TEXTURES } from '../assets/keys.js';
const FOG_SPEC_COLUMNS = 3;
const FULLY_KNOWN_TAG = 't.fog_k_k_k_k';
const CARDINAL_NEIGHBOR_OFFSETS = [
    { dq: 0, dr: -1 }, // north
    { dq: 1, dr: 0 }, // east
    { dq: 0, dr: 1 }, // south
    { dq: -1, dr: 0 }, // west
];
export class FogRenderer {
    scene;
    layer;
    worldToScreen;
    fogTagToFrame;
    constructor(scene, layer, worldToScreen) {
        this.scene = scene;
        this.layer = layer;
        this.worldToScreen = worldToScreen;
        const specText = this.scene.cache.text.get(FREELAND_SPECS.fog);
        if (typeof specText !== 'string' || specText.length === 0) {
            throw new Error(`Missing or empty Freeland fog spec "${FREELAND_SPECS.fog}" in Phaser text cache.`);
        }
        this.fogTagToFrame = parseFreecivTagFrameLookup(specText, FOG_SPEC_COLUMNS);
    }
    render(world) {
        this.layer.removeAll(true);
        const visibilityByHexKey = new Map(world.map.hexes.map((hex) => [hex.key, hex.visibility]));
        for (const hex of world.map.hexes) {
            if (hex.visibility === 'visible') {
                continue;
            }
            const point = this.worldToScreen(hex.q, hex.r);
            const [north, east, south, west] = this.resolveNeighborFogStates(hex.q, hex.r, visibilityByHexKey);
            const fogTag = getFogTag(north, east, south, west);
            const fogFrame = this.resolveFogFrame(fogTag);
            if (fogFrame === null) {
                continue;
            }
            const fogSprite = this.scene.add.image(Math.round(point.x), Math.round(point.y), TEXTURES.fog, fogFrame)
                .setOrigin(0.5, 1);
            this.layer.add(fogSprite);
        }
    }
    resolveNeighborFogStates(q, r, visibilityByHexKey) {
        const states = CARDINAL_NEIGHBOR_OFFSETS.map(({ dq, dr }) => {
            const neighborVisibility = visibilityByHexKey.get(`${q + dq},${r + dr}`) ?? 'hidden';
            return getFogRenderState(neighborVisibility);
        });
        return [states[0], states[1], states[2], states[3]];
    }
    resolveFogFrame(tag) {
        // Freeciv fog specs intentionally omit the fully-known tile.
        if (tag === FULLY_KNOWN_TAG) {
            return null;
        }
        const frame = this.fogTagToFrame.get(tag);
        if (frame !== undefined) {
            return frame;
        }
        const message = `Freeland fog tag "${tag}" not found in fog.spec.`;
        console.error(message);
        throw new Error(message);
    }
}
