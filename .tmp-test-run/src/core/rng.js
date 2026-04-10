// Create a new RNG with the given seed using mulberry32 algorithm
export function createRNG(seed) {
    // Normalize seed to unsigned 32-bit integer
    const normalizedSeed = seed >>> 0;
    return {
        seed: normalizedSeed,
        state: normalizedSeed
    };
}
// Internal function to generate next random value (0-1) using mulberry32
function next(rng) {
    let t = rng.state += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
// Generate a random integer in the inclusive range [min, max]
export function rngInt(rng, min, max) {
    if (min > max) {
        throw new Error(`rngInt: min (${min}) cannot be greater than max (${max})`);
    }
    const range = max - min + 1;
    return min + Math.floor(next(rng) * range);
}
// Pick a random element from an array
export function rngPick(rng, array) {
    if (array.length === 0) {
        throw new Error('rngPick: cannot pick from empty array');
    }
    const index = Math.floor(next(rng) * array.length);
    return array[index];
}
// Returns true with the given probability (0-1)
export function rngChance(rng, probability) {
    if (probability < 0 || probability > 1) {
        throw new Error(`rngChance: probability (${probability}) must be between 0 and 1`);
    }
    return next(rng) < probability;
}
export function rngNextFloat(rng) {
    return next(rng);
}
// Returns a new shuffled array using Fisher-Yates algorithm
export function rngShuffle(rng, array) {
    if (array.length === 0) {
        return [];
    }
    // Create a copy to avoid mutating the original
    const result = [...array];
    // Fisher-Yates shuffle
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(next(rng) * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
