/** Current time. Implemented by the system clock in adapters and by fixed clocks in tests. */
export interface Clock {
  now(): Date;
}
