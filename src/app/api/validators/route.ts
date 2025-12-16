import { NextResponse } from "next/server";
import { getValidators, getPoolInfo, yoctoToNear } from "@/lib/near";

export const runtime = "edge";

const NPRO_POOL_ID = "npro.poolv1.near";

export async function GET() {
  try {
    const [validators, poolInfo] = await Promise.all([
      getValidators(),
      getPoolInfo(NPRO_POOL_ID),
    ]);

    // Find NPRO pool in validators
    const nproValidator = validators.current_validators.find(
      (v) => v.account_id === NPRO_POOL_ID
    );

    // Get top validators for reference
    const topValidators = validators.current_validators
      .sort((a, b) => parseFloat(b.stake) - parseFloat(a.stake))
      .slice(0, 10)
      .map((v) => ({
        account_id: v.account_id,
        stake: yoctoToNear(v.stake),
        produced_blocks: v.num_produced_blocks,
        expected_blocks: v.num_expected_blocks,
        uptime:
          v.num_expected_blocks > 0
            ? ((v.num_produced_blocks / v.num_expected_blocks) * 100).toFixed(2) + "%"
            : "N/A",
      }));

    // Calculate network stats
    const totalStake = validators.current_validators.reduce(
      (sum, v) => sum + yoctoToNear(v.stake),
      0
    );

    return NextResponse.json({
      success: true,
      data: {
        epoch: {
          height: validators.epoch_height,
          startHeight: validators.epoch_start_height,
        },
        network: {
          totalValidators: validators.current_validators.length,
          nextValidators: validators.next_validators.length,
          totalStake,
        },
        nproPool: {
          poolId: NPRO_POOL_ID,
          totalStaked: yoctoToNear(poolInfo.total_staked_balance),
          fee: `${(poolInfo.reward_fee_fraction.numerator / poolInfo.reward_fee_fraction.denominator) * 100}%`,
          inActiveSet: !!nproValidator,
          validatorStake: nproValidator ? yoctoToNear(nproValidator.stake) : null,
        },
        topValidators,
      },
    });
  } catch (error) {
    console.error("Error fetching validators:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
