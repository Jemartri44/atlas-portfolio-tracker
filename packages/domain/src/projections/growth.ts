// The longest horizon of a projection, bounded here so that no client can make one run for minutes.

import { ValidationError } from "../errors.js";

export const MAX_HORIZON_YEARS = 100;

export const checkHorizon = (years: number): void => {
  if (!Number.isInteger(years) || years < 0 || years > MAX_HORIZON_YEARS) {
    throw new ValidationError("invalid_horizon", "the horizon is a whole number of years", {
      years,
      max: MAX_HORIZON_YEARS,
    });
  }
};
