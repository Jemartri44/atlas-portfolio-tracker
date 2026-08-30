import type { Clock } from "@atlas/domain";

export const systemClock: Clock = { now: () => new Date() };
