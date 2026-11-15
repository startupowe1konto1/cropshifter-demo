// The one place that decides which implementation each provider uses.
// A lane swaps its fixture for the real module with a one-line [contract] PR to this file (docs/PLAN.md).
import type { AnalyzeField, Providers } from '../contracts';
import { precomputedContextProvider } from '../context-data/provider';
import { analyzeField as engineAnalyzeField } from '../engine/analyzeField';
import { demoAdjust } from './demoAdjust';
import { tableMoneyProvider } from '../money/provider';
import { caseBaseTwinsProvider } from '../twins/provider';
import { powerProfileProvider } from '../profile/provider';

export const providers: Providers = {
  profile: powerProfileProvider, // O3-A2: NASA POWER monthly, live
  context: precomputedContextProvider, // O4-A3
  twins: caseBaseTwinsProvider, // O4-B3
  money: tableMoneyProvider, // O4-A4
};

// O3-B6: the real engine. The demo build then shows the farmer's rotation below every option on the demo fields.
export const analyzeField: AnalyzeField = async (input, p) => demoAdjust(await engineAnalyzeField(input, p));

/** True once the money tables and the income score are wired (O3-B7). The goal step reads it before any analysis exists. */
export const moneyAvailable = true;

/**
 * True once `providers.context` fetches soil from SoilGrids live (the O4-A3 live swap). Until then soil comes from the
 * precomputed demo files, and step 5 must not say that soil data is on its way from SoilGrids (#141 review).
 */
export const liveSoilData = false;
