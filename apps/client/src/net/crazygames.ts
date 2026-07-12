/**
 * CrazyGames SDK v3 bridge — live only in a CrazyGames build/context.
 *
 * The portal serves games inside an iframe on its own domains and requires
 * its SDK for loading/gameplay telemetry, ad breaks at natural pauses, and
 * lobby invite links. Everywhere else (GitHub Pages, localhost, VIVERSE,
 * itch) this module is a set of no-ops: the script is only injected when the
 * build opts in (VITE_CRAZYGAMES=1) or `?cg=1` is passed for local QA, and
 * every call is guarded — the SDK throws on every method when it decides it
 * is 'disabled', and an ad blocker may keep the script from loading at all.
 * The game must play identically in all of those cases.
 */

interface CrazySDK {
  init(): Promise<void>;
  environment: string;
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    happytime(): void;
    inviteLink(params: Record<string, string>): string;
    getInviteParam(name: string): string | null;
  };
  ad: {
    requestAd(
      type: "midgame" | "rewarded",
      callbacks: {
        adStarted?: () => void;
        adFinished?: () => void;
        adError?: (error: unknown) => void;
      },
    ): void;
  };
}

const wanted =
  import.meta.env.VITE_CRAZYGAMES === "1" ||
  new URLSearchParams(location.search).has("cg");

let sdk: CrazySDK | null = null;
let loading: Promise<void> | null = null;

function load(): Promise<void> {
  if (!wanted) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://sdk.crazygames.com/crazygames-sdk-v3.js";
    s.onload = () => {
      const cg = (window as { CrazyGames?: { SDK?: CrazySDK } }).CrazyGames?.SDK;
      if (!cg) return resolve();
      cg.init()
        .then(() => {
          if (cg.environment !== "disabled") sdk = cg;
        })
        .catch(() => undefined)
        .finally(resolve);
    };
    // Ad blocker / offline: the game still runs, just without the portal.
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
  return loading;
}

/** Swallow the 'disabled' throws — absence of the portal is never an error. */
function guard(fn: () => void): void {
  try {
    fn();
  } catch {
    /* SDK disabled or mid-teardown */
  }
}

export const crazy = {
  /** Fire-and-forget at boot: inject the SDK and report loading started. */
  boot(): void {
    void load().then(() => guard(() => sdk?.game.loadingStart()));
  },
  /** The app is interactive (first screen rendered). */
  loadingDone(): void {
    void load().then(() => guard(() => sdk?.game.loadingStop()));
  },
  gameplayStart(): void {
    guard(() => sdk?.game.gameplayStart());
  },
  gameplayStop(): void {
    guard(() => sdk?.game.gameplayStop());
  },
  /** A celebratory beat — the survivors won. */
  happytime(): void {
    guard(() => sdk?.game.happytime());
  },
  /** The room code an invite link carried us in with, if any. */
  async inviteCode(): Promise<string | null> {
    await load();
    try {
      return sdk?.game.getInviteParam("roomCode") ?? null;
    } catch {
      return null;
    }
  },
  /** A portal invite URL for this room — null off-portal (caller falls back). */
  inviteLink(roomCode: string): string | null {
    try {
      return sdk?.game.inviteLink({ roomCode }) ?? null;
    } catch {
      return null;
    }
  },
  /**
   * A midgame ad at a natural break (the results screen — the world is at
   * rest). `setQuiet` mutes/restores game audio around the spot.
   */
  midgameAd(setQuiet: (quiet: boolean) => void): void {
    if (!sdk) return;
    try {
      sdk.ad.requestAd("midgame", {
        adStarted: () => setQuiet(true),
        adFinished: () => setQuiet(false),
        adError: () => setQuiet(false),
      });
    } catch {
      setQuiet(false);
    }
  },
};
