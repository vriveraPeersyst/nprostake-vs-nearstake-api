import {
  getProtocolConfig,
  getValidators,
  getBlockHeader,
  yoctoToNear,
} from "./near";
import { BLOCKS_PER_EPOCH, DEFAULT_BLOCK_TIME, getSecondsPerYear } from "./bonding-curve";

/**
 * nearcore uses a fixed 365-day year when minting epoch rewards
 * (NUM_SECONDS_IN_A_YEAR in chain/epoch-manager/src/reward_calculator.rs).
 */
const PROTOCOL_SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

// Fallbacks for mainnet (protocol v81+, after the Oct 2025 inflation halving)
const FALLBACK_MAX_INFLATION_RATE = 1 / 40; // 2.5%
const FALLBACK_PROTOCOL_REWARD_RATE = 1 / 10; // 10% goes to the protocol treasury

// Need enough blocks into the epoch for a meaningful block-time average
const MIN_BLOCKS_FOR_BLOCK_TIME = 1000;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let stakingParamsCache: { value: NearStakingParams; timestamp: number } | null = null;

export interface NearStakingParams {
  /** Max annual inflation of the total supply (e.g. 0.025) */
  maxInflationRate: number;
  /** Share of minted NEAR sent to the treasury instead of validators (e.g. 0.1) */
  protocolRewardRate: number;
  /** Current total NEAR supply */
  totalSupplyNear: number;
  /** Sum of the stake of all current-epoch validators */
  totalStakedNear: number;
  /** totalStakedNear / totalSupplyNear */
  stakingRatio: number;
  /** Blocks (heights) per epoch */
  epochLength: number;
  /** Average block time measured over the current epoch, in seconds */
  blockTime: number;
  epochDurationSeconds: number;
  epochsPerYear: number;
  /** Reward per epoch as a fraction of stake (0% fee validator, full uptime) */
  epochRewardRate: number;
  /** Simple annual rate, no compounding */
  apr: number;
  /** Annual rate with rewards restaked every epoch, as staking pools do */
  apy: number;
}

function ratio([numerator, denominator]: [number, number]): number {
  return numerator / denominator;
}

/**
 * Average block time over the current epoch, from the timestamps of the
 * epoch's first block and the latest final block.
 */
async function measureBlockTime(
  epochStartHeight: number,
  latest: { height: number; timestamp_nanosec: string }
): Promise<number> {
  const heights = latest.height - epochStartHeight;
  if (heights < MIN_BLOCKS_FOR_BLOCK_TIME) return DEFAULT_BLOCK_TIME;

  try {
    const start = await getBlockHeader(epochStartHeight);
    const elapsedSeconds =
      Number(BigInt(latest.timestamp_nanosec) - BigInt(start.timestamp_nanosec)) / 1e9;
    const blockTime = elapsedSeconds / heights;
    return blockTime > 0 ? blockTime : DEFAULT_BLOCK_TIME;
  } catch (error) {
    console.warn(`Failed to measure block time: ${(error as Error).message}`);
    return DEFAULT_BLOCK_TIME;
  }
}

/**
 * Compute the NEAR staking yield the protocol actually pays, following
 * nearcore's reward calculator:
 *
 *   epochReward      = totalSupply × maxInflationRate × epochDuration / secondsPerYear(365d)
 *   validatorsReward = epochReward × (1 − protocolRewardRate)
 *   delegatorReward  = validatorsReward × stake / totalStake   (0% fee, full uptime)
 *
 * so the per-epoch return on stake is
 *
 *   r = (1 − protocolRewardRate) × maxInflationRate × (totalSupply / totalStake)
 *       × epochDuration / secondsPerYear(365d)
 *
 * and APY compounds r over the epochs in a calendar year.
 */
export async function getNearStakingParams(): Promise<NearStakingParams> {
  if (stakingParamsCache && Date.now() - stakingParamsCache.timestamp < CACHE_TTL_MS) {
    return stakingParamsCache.value;
  }

  const [config, validators, latestBlock] = await Promise.all([
    getProtocolConfig().catch((error) => {
      console.warn(`Failed to fetch protocol config: ${(error as Error).message}`);
      return null;
    }),
    getValidators(),
    getBlockHeader(),
  ]);

  const maxInflationRate = config ? ratio(config.max_inflation_rate) : FALLBACK_MAX_INFLATION_RATE;
  const protocolRewardRate = config
    ? ratio(config.protocol_reward_rate)
    : FALLBACK_PROTOCOL_REWARD_RATE;
  const epochLength = config?.epoch_length ?? BLOCKS_PER_EPOCH;

  const totalSupplyNear = yoctoToNear(latestBlock.total_supply);
  const totalStakedNear = validators.current_validators.reduce(
    (sum, v) => sum + yoctoToNear(v.stake),
    0
  );
  if (totalStakedNear <= 0) {
    throw new Error("No stake found in current validators");
  }

  const blockTime = await measureBlockTime(validators.epoch_start_height, latestBlock);
  const epochDurationSeconds = epochLength * blockTime;
  const epochsPerYear = getSecondsPerYear() / epochDurationSeconds;

  const epochRewardRate =
    ((1 - protocolRewardRate) *
      maxInflationRate *
      (totalSupplyNear / totalStakedNear) *
      epochDurationSeconds) /
    PROTOCOL_SECONDS_PER_YEAR;

  const value: NearStakingParams = {
    maxInflationRate,
    protocolRewardRate,
    totalSupplyNear,
    totalStakedNear,
    stakingRatio: totalStakedNear / totalSupplyNear,
    epochLength,
    blockTime,
    epochDurationSeconds,
    epochsPerYear,
    epochRewardRate,
    apr: epochRewardRate * epochsPerYear,
    apy: Math.pow(1 + epochRewardRate, epochsPerYear) - 1,
  };

  stakingParamsCache = { value, timestamp: Date.now() };
  return value;
}
