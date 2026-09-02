import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  FETCH_MODE,
  applyProviderSafetyFetchResult,
  isDirtyState,
  providersListEqual,
  shouldShowSelectLoading,
  shouldSyncDraftFromFetch,
} from "../../src/app/(dashboard)/dashboard/go-engine/providerSafetyCardState.js";
import { createPollScheduler } from "../../src/shared/utils/pollScheduler.js";

const baseProviders = [
  { providerId: "opencode", label: "OpenCode Free", description: "opencode", icon: "code" },
  { providerId: "openrouter", label: "OpenRouter", description: "openrouter", icon: "router" },
];

const opencodeSnapshot = {
  providerId: "opencode",
  effectiveProviderMax: 1,
  recommendedProviderMax: 1,
  active: 0,
  queued: 0,
  editable: true,
  hasOverride: false,
};

function baseState(overrides = {}) {
  return {
    providers: baseProviders,
    selectedProviderId: "opencode",
    snapshot: opencodeSnapshot,
    draftMax: 1,
    initialLoading: false,
    providerSwitchLoading: false,
    ...overrides,
  };
}

function responseFor(providerId, effectiveProviderMax, extra = {}) {
  return {
    providerId,
    providers: baseProviders,
    effectiveProviderMax,
    limit: effectiveProviderMax,
    active: extra.active ?? 0,
    queued: extra.queued ?? 0,
    providerHealth: extra.providerHealth ?? "Healthy",
    editable: extra.editable ?? true,
    ...extra,
  };
}

function applyPoll(state, data, selectionSeq = 1) {
  return applyProviderSafetyFetchResult(state, {
    data,
    mode: FETCH_MODE.POLL,
    capturedSelectionSeq: selectionSeq,
    activeSelectionSeq: selectionSeq,
    targetProviderId: data.providerId,
    mutationInFlight: false,
    mutationSeq: 0,
    activeMutationSeq: 0,
  });
}

describe("provider safety card state", () => {
  it("does not sync draft from background poll while user edited value", () => {
    const state = baseState({ draftMax: 2 });
    const patch = applyPoll(state, responseFor("opencode", 1, { active: 1, queued: 3 }));

    expect(patch).not.toBeNull();
    expect(patch.draftMax).toBeUndefined();
    expect(patch.snapshot.effectiveProviderMax).toBe(1);
    expect(patch.snapshot.active).toBe(1);
    expect(patch.snapshot.queued).toBe(3);
    expect(isDirtyState(patch.snapshot, state.draftMax)).toBe(true);
  });

  it("initializes draft on initial and provider switch loads", () => {
    const initialPatch = applyProviderSafetyFetchResult(baseState({ draftMax: 1 }), {
      data: responseFor("openrouter", 8),
      mode: FETCH_MODE.INITIAL,
      capturedSelectionSeq: 1,
      activeSelectionSeq: 1,
      targetProviderId: "openrouter",
      mutationInFlight: false,
      mutationSeq: 0,
      activeMutationSeq: 0,
    });
    expect(initialPatch.draftMax).toBe(8);

    const switchPatch = applyProviderSafetyFetchResult(baseState({ draftMax: 2 }), {
      data: responseFor("openrouter", 8),
      mode: FETCH_MODE.PROVIDER_SWITCH,
      capturedSelectionSeq: 2,
      activeSelectionSeq: 2,
      targetProviderId: "openrouter",
      mutationInFlight: false,
      mutationSeq: 0,
      activeMutationSeq: 0,
    });
    expect(switchPatch.draftMax).toBe(8);
  });

  it("does not put Select into loading state during poll refresh", () => {
    expect(shouldShowSelectLoading({ initialLoading: false, providerSwitchLoading: false })).toBe(false);
    expect(shouldShowSelectLoading({ initialLoading: true, providerSwitchLoading: false })).toBe(true);
    expect(shouldShowSelectLoading({ initialLoading: false, providerSwitchLoading: true })).toBe(true);
    expect(shouldSyncDraftFromFetch(FETCH_MODE.POLL)).toBe(false);
  });

  it("does not replace provider options during poll when list is unchanged", () => {
    const state = baseState();
    const patch = applyPoll(state, responseFor("opencode", 1));
    expect(patch.providers).toBeUndefined();
  });

  it("ignores stale provider responses after rapid provider switching", () => {
    const state = baseState({ selectedProviderId: "opencode", draftMax: 1 });
    const patch = applyProviderSafetyFetchResult(state, {
      data: responseFor("openrouter", 8),
      mode: FETCH_MODE.PROVIDER_SWITCH,
      capturedSelectionSeq: 1,
      activeSelectionSeq: 2,
      targetProviderId: "opencode",
      mutationInFlight: false,
      mutationSeq: 0,
      activeMutationSeq: 0,
    });
    expect(patch).toBeNull();
  });

  it("ignores poll responses while save/reset mutation is in flight", () => {
    const state = baseState({ draftMax: 2 });
    const patch = applyProviderSafetyFetchResult(state, {
      data: responseFor("opencode", 1),
      mode: FETCH_MODE.POLL,
      capturedSelectionSeq: 3,
      activeSelectionSeq: 3,
      targetProviderId: "opencode",
      mutationInFlight: true,
      mutationSeq: 1,
      activeMutationSeq: 1,
    });
    expect(patch).toBeNull();
  });

  it("save success synchronizes draft and clears dirty state", () => {
    const state = baseState({ draftMax: 2 });
    const patch = applyProviderSafetyFetchResult(state, {
      data: responseFor("opencode", 2),
      mode: FETCH_MODE.SAVE_SUCCESS,
      capturedSelectionSeq: 4,
      activeSelectionSeq: 4,
      targetProviderId: "opencode",
      mutationInFlight: false,
      mutationSeq: 2,
      activeMutationSeq: 2,
    });
    expect(patch.draftMax).toBe(2);
    expect(isDirtyState(patch.snapshot, patch.draftMax)).toBe(false);
  });

  it("failed save leaves draft untouched when poll returns old server value", () => {
    const state = baseState({ draftMax: 2 });
    const pollPatch = applyPoll(state, responseFor("opencode", 1));
    expect(pollPatch.draftMax).toBeUndefined();
    expect(isDirtyState(pollPatch.snapshot, state.draftMax)).toBe(true);
  });

  it("reset success synchronizes draft to recommended value", () => {
    const state = baseState({
      draftMax: 2,
      snapshot: { ...opencodeSnapshot, effectiveProviderMax: 2, hasOverride: true },
    });
    const patch = applyProviderSafetyFetchResult(state, {
      data: responseFor("opencode", 1, { hasOverride: false }),
      mode: FETCH_MODE.RESET_SUCCESS,
      capturedSelectionSeq: 6,
      activeSelectionSeq: 6,
      targetProviderId: "opencode",
      mutationInFlight: false,
      mutationSeq: 3,
      activeMutationSeq: 3,
    });
    expect(patch.draftMax).toBe(1);
  });

  it("preserves draft when external config changes while dirty", () => {
    const state = baseState({ draftMax: 2 });
    const patch = applyPoll(state, responseFor("opencode", 3));
    expect(patch.draftMax).toBeUndefined();
    expect(patch.snapshot.effectiveProviderMax).toBe(3);
    expect(isDirtyState(patch.snapshot, state.draftMax)).toBe(true);
  });

  it("providersListEqual avoids unnecessary provider array replacement", () => {
    const a = [{ providerId: "opencode", label: "OpenCode Free" }];
    const b = [{ providerId: "opencode", label: "OpenCode Free" }];
    expect(providersListEqual(a, b)).toBe(true);
    expect(providersListEqual(a, [{ providerId: "openrouter", label: "OpenRouter" }])).toBe(false);
  });

  it("poll patch does not clear initial loading flag", () => {
    const patch = applyPoll(baseState({ draftMax: 2 }), responseFor("opencode", 1));
    expect(patch.initialLoading).toBeUndefined();
  });

  it("save success then poll keeps stable saved value", () => {
    const saved = applyProviderSafetyFetchResult(baseState({ draftMax: 2 }), {
      data: responseFor("opencode", 2),
      mode: FETCH_MODE.SAVE_SUCCESS,
      capturedSelectionSeq: 1,
      activeSelectionSeq: 1,
      targetProviderId: "opencode",
      mutationInFlight: false,
      mutationSeq: 1,
      activeMutationSeq: 1,
    });
    const afterPoll = applyPoll(
      { ...baseState(), snapshot: saved.snapshot, draftMax: saved.draftMax },
      responseFor("opencode", 2, { active: 1 }),
    );
    expect(afterPoll.draftMax).toBeUndefined();
    expect(isDirtyState(afterPoll.snapshot, saved.draftMax)).toBe(false);
  });
});

describe("provider safety poll scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not start overlapping polls while previous poll is still in flight", async () => {
    let activePolls = 0;
    let maxActivePolls = 0;
    let resolvePoll;
    const poll = vi.fn(() => new Promise((resolve) => {
      activePolls += 1;
      maxActivePolls = Math.max(maxActivePolls, activePolls);
      resolvePoll = () => {
        activePolls -= 1;
        resolve();
      };
    }));

    const scheduler = createPollScheduler({
      intervalMs: 1000,
      poll,
      isActive: () => true,
    });

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(maxActivePolls).toBe(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(poll).toHaveBeenCalledTimes(1);

    resolvePoll();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(poll).toHaveBeenCalledTimes(2);
    expect(maxActivePolls).toBe(1);

    scheduler.stop();
  });
});

describe("save vs poll sequencing", () => {
  it("save response wins over older poll response with stale effective value", () => {
    const state = baseState({ draftMax: 2 });

    const pollPatch = applyPoll(state, responseFor("opencode", 1));
    expect(pollPatch.draftMax).toBeUndefined();

    const savePatch = applyProviderSafetyFetchResult(
      { ...state, snapshot: pollPatch.snapshot },
      {
        data: responseFor("opencode", 2),
        mode: FETCH_MODE.SAVE_SUCCESS,
        capturedSelectionSeq: 1,
        activeSelectionSeq: 1,
        targetProviderId: "opencode",
        mutationInFlight: false,
        mutationSeq: 1,
        activeMutationSeq: 1,
      },
    );
    expect(savePatch.draftMax).toBe(2);
    expect(isDirtyState(savePatch.snapshot, savePatch.draftMax)).toBe(false);
  });
});
