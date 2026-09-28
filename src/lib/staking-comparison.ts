import { getPoolTotalStaked, yoctoToNear, getNearPriceUsd, getNproPriceUsd } from "./near";
import {
  getCurrentEpoch,
  getNproBondingCurveValue,
  calculateTotalNproOverYear,
  calculateNproEffectiveApy,
} from "./bonding-curve";
import { getNearStakingParams } from "./near-staking";

const NPRO_POOL_ID = "npro.poolv1.near";

export interface StakingComparisonResult {
  // Current epoch info
  epoch: {
    current: number;
    next: number;
    blocksPerEpoch: number;
    epochDurationSeconds: number;
    epochDurationHours: number;
    epochsPerYear: number;
  };
  
  // Pool data
  pool: {
    poolId: string;
    totalStakedNear: number;
    totalStakedUsd: number;
  };
  
  // NEAR staking rewards (0% fee validator), derived from on-chain inflation and total stake
  nearStaking: {
    apyPercent: number;
    aprPercent: number;
    epochRewardRatePercent: number;
    nearEarnedPerEpoch: number;
    nearEarnedPerEpochUsd: number;
    nearEarnedPerYear: number;
    nearEarnedPerYearUsd: number;
  };
  
  // NPRO staking rewards (from bonding curve with decay)
  nproStaking: {
    nproDistributedNextEpoch: number;
    nproDistributedNextEpochUsd: number;
    nproDistributedPerYear: number;
    nproDistributedPerYearUsd: number;
    effectiveApyPercent: number;
  };
  
  // Comparison (per epoch)
  perEpochComparison: {
    differenceUsd: number;
    differencePercent: number;
    betterOption: "npro" | "near" | "equal";
  };
  
  // Comparison (per year with decay)
  yearlyComparison: {
    differenceUsd: number;
    differencePercent: number;
    betterOption: "npro" | "near" | "equal";
    summary: string;
  };
  
  // Network-wide inputs to the NEAR staking APY
  network: {
    totalSupplyNear: number;
    totalStakedNear: number;
    stakingRatioPercent: number;
    maxInflationRatePercent: number;
    protocolRewardRatePercent: number;
  };

  // Prices
  prices: {
    nearUsd: number;
    nproUsd: number;
  };
  
  // Metadata
  meta: {
    timestamp: string;
    blockTime: number;
  };
}

export async function calculateStakingComparison(): Promise<StakingComparisonResult> {
  // Fetch all required data in parallel
  const [
    totalStakedYocto,
    currentEpoch,
    nearPriceUsd,
    nproPriceUsd,
    nearParams,
  ] = await Promise.all([
    getPoolTotalStaked(NPRO_POOL_ID),
    getCurrentEpoch(),
    getNearPriceUsd(),
    getNproPriceUsd(),
    getNearStakingParams(),
  ]);

  const totalStakedNear = yoctoToNear(totalStakedYocto);
  const totalStakedUsd = totalStakedNear * nearPriceUsd;
  const nextEpoch = currentEpoch + 1;
  
  // Epoch duration from the block time measured on-chain
  const { blockTime, epochDurationSeconds, epochsPerYear } = nearParams;
  const epochDurationHours = epochDurationSeconds / 3600;

  // ============================================
  // NEAR Staking Rewards (0% fee validator)
  // ============================================
  const nearApyPercent = nearParams.apy * 100;
  const nearEarnedPerEpoch = totalStakedNear * nearParams.epochRewardRate;
  const nearEarnedPerEpochUsd = nearEarnedPerEpoch * nearPriceUsd;
  const nearEarnedPerYear = totalStakedNear * nearParams.apy;
  const nearEarnedPerYearUsd = nearEarnedPerYear * nearPriceUsd;

  // ============================================
  // NPRO Staking Rewards (Bonding Curve with Decay)
  // ============================================
  // Next epoch reward
  const nproDistributedNextEpoch = getNproBondingCurveValue(nextEpoch);
  const nproDistributedNextEpochUsd = nproDistributedNextEpoch * nproPriceUsd;
  
  // Full year reward (accounting for decay over all epochs)
  const nproDistributedPerYear = calculateTotalNproOverYear(nextEpoch, blockTime);
  const nproDistributedPerYearUsd = nproDistributedPerYear * nproPriceUsd;
  
  // Effective APY for NPRO (accounting for decay)
  const nproEffectiveApy = calculateNproEffectiveApy(
    nextEpoch,
    totalStakedNear,
    nproPriceUsd,
    nearPriceUsd,
    blockTime
  );

  // ============================================
  // Per-Epoch Comparison
  // ============================================
  const perEpochDifferenceUsd = nproDistributedNextEpochUsd - nearEarnedPerEpochUsd;
  const perEpochDifferencePercent = nearEarnedPerEpochUsd > 0 
    ? ((nproDistributedNextEpochUsd - nearEarnedPerEpochUsd) / nearEarnedPerEpochUsd) * 100
    : 0;

  let perEpochBetterOption: "npro" | "near" | "equal" = "equal";
  if (perEpochDifferencePercent > 0.5) {
    perEpochBetterOption = "npro";
  } else if (perEpochDifferencePercent < -0.5) {
    perEpochBetterOption = "near";
  }

  // ============================================
  // Yearly Comparison (with decay)
  // ============================================
  const yearlyDifferenceUsd = nproDistributedPerYearUsd - nearEarnedPerYearUsd;
  const yearlyDifferencePercent = nearEarnedPerYearUsd > 0 
    ? ((nproDistributedPerYearUsd - nearEarnedPerYearUsd) / nearEarnedPerYearUsd) * 100
    : 0;

  let yearlyBetterOption: "npro" | "near" | "equal" = "equal";
  if (yearlyDifferencePercent > 0.5) {
    yearlyBetterOption = "npro";
  } else if (yearlyDifferencePercent < -0.5) {
    yearlyBetterOption = "near";
  }

  const summary = yearlyBetterOption === "npro"
    ? `NPRO staking yields ${nproEffectiveApy.toFixed(2)}% effective APY vs NEAR's ${nearApyPercent.toFixed(2)}% (+$${yearlyDifferenceUsd.toFixed(2)}/year)`
    : yearlyBetterOption === "near"
    ? `NEAR staking is better: ${nearApyPercent.toFixed(2)}% APY vs NPRO's ${nproEffectiveApy.toFixed(2)}% effective APY`
    : `Both options yield approximately equal returns`;

  return {
    epoch: {
      current: currentEpoch,
      next: nextEpoch,
      blocksPerEpoch: nearParams.epochLength,
      epochDurationSeconds,
      epochDurationHours,
      epochsPerYear,
    },
    pool: {
      poolId: NPRO_POOL_ID,
      totalStakedNear,
      totalStakedUsd,
    },
    nearStaking: {
      apyPercent: nearApyPercent,
      aprPercent: nearParams.apr * 100,
      epochRewardRatePercent: nearParams.epochRewardRate * 100,
      nearEarnedPerEpoch,
      nearEarnedPerEpochUsd,
      nearEarnedPerYear,
      nearEarnedPerYearUsd,
    },
    nproStaking: {
      nproDistributedNextEpoch,
      nproDistributedNextEpochUsd,
      nproDistributedPerYear,
      nproDistributedPerYearUsd,
      effectiveApyPercent: nproEffectiveApy,
    },
    perEpochComparison: {
      differenceUsd: perEpochDifferenceUsd,
      differencePercent: perEpochDifferencePercent,
      betterOption: perEpochBetterOption,
    },
    yearlyComparison: {
      differenceUsd: yearlyDifferenceUsd,
      differencePercent: yearlyDifferencePercent,
      betterOption: yearlyBetterOption,
      summary,
    },
    network: {
      totalSupplyNear: nearParams.totalSupplyNear,
      totalStakedNear: nearParams.totalStakedNear,
      stakingRatioPercent: nearParams.stakingRatio * 100,
      maxInflationRatePercent: nearParams.maxInflationRate * 100,
      protocolRewardRatePercent: nearParams.protocolRewardRate * 100,
    },
    prices: {
      nearUsd: nearPriceUsd,
      nproUsd: nproPriceUsd,
    },
    meta: {
      timestamp: new Date().toISOString(),
      blockTime,
    },
  };
}

/**
 * Calculate comparison for a specific user stake amount
 */
export async function calculateUserStakingComparison(
  userStakeNear: number
): Promise<StakingComparisonResult & { 
  userRewards: { 
    stakeAmount: number;
    nearPerEpoch: number; 
    nearPerEpochUsd: number; 
    nearPerYear: number;
    nearPerYearUsd: number;
    nproPerEpoch: number; 
    nproPerEpochUsd: number; 
    nproPerYear: number;
    nproPerYearUsd: number;
    perEpochDifferenceUsd: number; 
    perEpochDifferencePercent: number;
    yearlyDifferenceUsd: number;
    yearlyDifferencePercent: number;
  } 
}> {
  const comparison = await calculateStakingComparison();
  
  // Calculate user's proportional share
  const userShare = userStakeNear / comparison.pool.totalStakedNear;
  
  // User NEAR rewards (if staking on normal validator)
  const userNearPerEpoch = comparison.nearStaking.nearEarnedPerEpoch * userShare;
  const userNearPerEpochUsd = userNearPerEpoch * comparison.prices.nearUsd;
  const userNearPerYear = comparison.nearStaking.nearEarnedPerYear * userShare;
  const userNearPerYearUsd = userNearPerYear * comparison.prices.nearUsd;
  
  // User NPRO rewards (from bonding curve distribution)
  const userNproPerEpoch = comparison.nproStaking.nproDistributedNextEpoch * userShare;
  const userNproPerEpochUsd = userNproPerEpoch * comparison.prices.nproUsd;
  const userNproPerYear = comparison.nproStaking.nproDistributedPerYear * userShare;
  const userNproPerYearUsd = userNproPerYear * comparison.prices.nproUsd;
  
  // User per-epoch comparison
  const perEpochDifferenceUsd = userNproPerEpochUsd - userNearPerEpochUsd;
  const perEpochDifferencePercent = userNearPerEpochUsd > 0
    ? ((userNproPerEpochUsd - userNearPerEpochUsd) / userNearPerEpochUsd) * 100
    : 0;
    
  // User yearly comparison (with decay)
  const yearlyDifferenceUsd = userNproPerYearUsd - userNearPerYearUsd;
  const yearlyDifferencePercent = userNearPerYearUsd > 0
    ? ((userNproPerYearUsd - userNearPerYearUsd) / userNearPerYearUsd) * 100
    : 0;

  return {
    ...comparison,
    userRewards: {
      stakeAmount: userStakeNear,
      nearPerEpoch: userNearPerEpoch,
      nearPerEpochUsd: userNearPerEpochUsd,
      nearPerYear: userNearPerYear,
      nearPerYearUsd: userNearPerYearUsd,
      nproPerEpoch: userNproPerEpoch,
      nproPerEpochUsd: userNproPerEpochUsd,
      nproPerYear: userNproPerYear,
      nproPerYearUsd: userNproPerYearUsd,
      perEpochDifferenceUsd,
      perEpochDifferencePercent,
      yearlyDifferenceUsd,
      yearlyDifferencePercent,
    },
  };
}
