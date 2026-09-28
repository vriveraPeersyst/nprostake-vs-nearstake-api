// NPRO bonding curve constants
export const BONDING_CURVE_CONFIG = {
  r0: '1892.824882239740',
  lambda: '0.00023664977144416'
} as const;

// NPRO decimals (same as NEAR - 24 decimals for yoctoNPRO)
export const NPRO_DECIMALS = 24;

// NEAR blockchain constants
export const BLOCKS_PER_EPOCH = 43200; // 1 epoch = 43200 blocks
export const DEFAULT_BLOCK_TIME = 0.623; // Default block time in seconds

// NPRO distribution start parameters
export const NPRO_START_BLOCK = 164137435; // Block when NPRO distribution started
export const NPRO_START_EPOCH = 1; // Epoch 1 is when NPRO distribution started

// Cache for current block number
let cachedCurrentBlock: number | null = null;
let currentBlockCacheExpiry: number = 0;

// Cache for block time
let cachedBlockTime: number | null = null;
let blockTimeCacheExpiry: number = 0;

/**
 * Fetch current block number from NEAR RPC
 */
export async function fetchCurrentBlockNumber(): Promise<number> {
  const now = Date.now();
  if (cachedCurrentBlock !== null && now < currentBlockCacheExpiry) {
    return cachedCurrentBlock;
  }

  try {
    const response = await fetch('https://rpc.mainnet.near.org', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'dontcare',
        method: 'status',
        params: []
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const blockHeight = data.result.sync_info.latest_block_height;
    
    // Cache the result for 1 minute
    cachedCurrentBlock = blockHeight;
    currentBlockCacheExpiry = now + (1 * 60 * 1000);
    
    return blockHeight;
  } catch (error) {
    console.warn('Failed to fetch current block number:', error);
    throw error;
  }
}

/**
 * Convert block number to epoch number
 */
export function blockToEpoch(blockNumber: number): number {
  const blocksSinceStart = Math.max(0, blockNumber - NPRO_START_BLOCK);
  const epochsSinceStart = Math.floor(blocksSinceStart / BLOCKS_PER_EPOCH);
  return NPRO_START_EPOCH + epochsSinceStart;
}

/**
 * Calculate current epoch based on actual block numbers
 */
export async function getCurrentEpoch(): Promise<number> {
  const currentBlock = await fetchCurrentBlockNumber();
  return blockToEpoch(currentBlock);
}

/**
 * Get epoch duration in seconds
 */
export function getEpochDurationSeconds(blockTime: number = DEFAULT_BLOCK_TIME): number {
  return BLOCKS_PER_EPOCH * blockTime;
}

/**
 * Calculate seconds in a year (for APY conversion)
 */
export function getSecondsPerYear(): number {
  return 365.25 * 24 * 60 * 60;
}

/**
 * NPRO bonding curve function.
 * R(t) = R0 * e^(-λt)
 * @param epochNumber The epoch number (1-based, where 1 is the first distribution epoch)
 * @returns The NPRO amount to distribute in this epoch (in human-readable units, not yocto)
 */
export function getNproBondingCurveValue(epochNumber: number): number {
  const r0 = parseFloat(BONDING_CURVE_CONFIG.r0);
  const lambda = parseFloat(BONDING_CURVE_CONFIG.lambda);
  
  // t is the epoch index (0-based for the formula)
  const t = epochNumber - NPRO_START_EPOCH;
  
  // Calculate R(t) = R0 * e^(-λt)
  const exponent = -lambda * t;
  const result = r0 * Math.exp(exponent);
  
  return result;
}

/**
 * Calculate NPRO reward for a user in a specific epoch
 * @param epochNumber The epoch number
 * @param userStakedNear User's staked NEAR in the pool
 * @param totalStakedNear Total NEAR staked in the pool
 * @returns NPRO earned by the user in this epoch
 */
export function calculateUserNproRewardForEpoch(
  epochNumber: number,
  userStakedNear: number,
  totalStakedNear: number
): number {
  if (totalStakedNear <= 0) {
    return 0;
  }
  
  const totalNproDistributed = getNproBondingCurveValue(epochNumber);
  const userShare = userStakedNear / totalStakedNear;
  
  return totalNproDistributed * userShare;
}

/**
 * Calculate total NPRO distributed in an epoch (for the entire pool)
 * @param epochNumber The epoch number
 * @returns Total NPRO distributed to all stakers in this epoch
 */
export function getTotalNproDistributedForEpoch(epochNumber: number): number {
  return getNproBondingCurveValue(epochNumber);
}

/**
 * Calculate the number of epochs in a year
 * @param blockTime Average block time in seconds
 * @returns Number of epochs per year
 */
export function getEpochsPerYear(blockTime: number = DEFAULT_BLOCK_TIME): number {
  const epochDurationSeconds = getEpochDurationSeconds(blockTime);
  const secondsPerYear = getSecondsPerYear();
  return secondsPerYear / epochDurationSeconds;
}

/**
 * Calculate total NPRO distributed over a year starting from a given epoch
 * This accounts for the bonding curve decay over time
 * @param startEpoch The starting epoch number
 * @param blockTime Average block time in seconds
 * @returns Total NPRO distributed over the year
 */
export function calculateTotalNproOverYear(
  startEpoch: number,
  blockTime: number = DEFAULT_BLOCK_TIME
): number {
  const epochsPerYear = Math.floor(getEpochsPerYear(blockTime));
  let totalNpro = 0;
  
  for (let i = 0; i < epochsPerYear; i++) {
    totalNpro += getNproBondingCurveValue(startEpoch + i);
  }
  
  return totalNpro;
}

/**
 * Calculate NPRO APY equivalent based on bonding curve decay
 * This compares the USD value of NPRO rewards to the staked NEAR value
 * @param startEpoch The starting epoch
 * @param totalStakedNear Total NEAR staked in the pool
 * @param nproPriceUsd NPRO price in USD
 * @param nearPriceUsd NEAR price in USD
 * @param blockTime Average block time
 * @returns Effective APY percentage
 */
export function calculateNproEffectiveApy(
  startEpoch: number,
  totalStakedNear: number,
  nproPriceUsd: number,
  nearPriceUsd: number,
  blockTime: number = DEFAULT_BLOCK_TIME
): number {
  const totalNproOverYear = calculateTotalNproOverYear(startEpoch, blockTime);
  const totalNproValueUsd = totalNproOverYear * nproPriceUsd;
  const totalStakedValueUsd = totalStakedNear * nearPriceUsd;
  
  if (totalStakedValueUsd <= 0) return 0;
  
  // APY = (rewards / principal) * 100
  return (totalNproValueUsd / totalStakedValueUsd) * 100;
}
