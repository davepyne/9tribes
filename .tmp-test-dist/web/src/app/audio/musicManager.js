const TITLE_TRACK = '/assets/audio/music/title_screen.mp3';
const GAMEPLAY_TRACKS = Array.from({ length: 13 }, (_, index) => `/assets/audio/music/track_${index + 1}.mp3`);
const MENU_UI_SOUND = '/assets/audio/ui/menu-select.wav';
class MusicManager {
    audio = null;
    phase = 'none';
    gameplayQueue = [];
    currentTrack = null;
    activationHooksInstalled = false;
    setPhase(phase) {
        if (phase === this.phase) {
            return;
        }
        this.phase = phase;
        if (phase === 'none') {
            this.stop();
            return;
        }
        this.ensureAudio();
        if (!this.audio) {
            return;
        }
        if (phase === 'menu') {
            this.playTrack(TITLE_TRACK, true);
            return;
        }
        this.audio.loop = false;
        if (this.currentTrack && this.currentTrack !== TITLE_TRACK) {
            void this.tryPlay();
            return;
        }
        this.playNextGameplayTrack();
    }
    ensureAudio() {
        if (this.audio) {
            return;
        }
        const audio = new Audio();
        audio.preload = 'auto';
        audio.volume = 0.4;
        audio.addEventListener('ended', () => {
            if (this.phase === 'gameplay') {
                this.playNextGameplayTrack();
            }
        });
        this.audio = audio;
        this.installActivationHooks();
    }
    installActivationHooks() {
        if (this.activationHooksInstalled || typeof window === 'undefined') {
            return;
        }
        this.activationHooksInstalled = true;
        const resumeAudio = () => {
            void this.tryPlay();
        };
        window.addEventListener('pointerdown', resumeAudio, { passive: true });
        window.addEventListener('keydown', resumeAudio);
    }
    playTrack(src, loop) {
        if (!this.audio) {
            return;
        }
        const changed = this.currentTrack !== src;
        this.audio.loop = loop;
        if (changed) {
            this.audio.src = src;
            this.audio.currentTime = 0;
            this.currentTrack = src;
        }
        void this.tryPlay();
    }
    playNextGameplayTrack() {
        if (!this.audio || this.phase !== 'gameplay') {
            return;
        }
        if (this.gameplayQueue.length === 0) {
            this.gameplayQueue = shuffle([...GAMEPLAY_TRACKS]);
        }
        const nextTrack = this.gameplayQueue.shift();
        if (!nextTrack) {
            return;
        }
        this.playTrack(nextTrack, false);
    }
    async tryPlay() {
        if (!this.audio || this.phase === 'none') {
            return;
        }
        try {
            await this.audio.play();
        }
        catch {
            // Browser autoplay rules may block until the player interacts.
        }
    }
    stop() {
        if (!this.audio) {
            return;
        }
        this.audio.pause();
        this.audio.currentTime = 0;
        this.currentTrack = null;
    }
}
function shuffle(items) {
    for (let index = items.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
    return items;
}
const musicManager = new MusicManager();
export function syncMusicForMode(mode) {
    if (mode === 'play' || mode === 'replay') {
        musicManager.setPhase('gameplay');
        return;
    }
    musicManager.setPhase('menu');
}
export function playMenuUiSound() {
    try {
        const sound = new Audio(MENU_UI_SOUND);
        sound.volume = 0.55;
        void sound.play().catch(() => {
            // Ignore failures caused by browser media policies.
        });
    }
    catch {
        // Ignore failures if audio cannot be constructed in this environment.
    }
}
