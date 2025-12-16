import { NextRequest, NextResponse } from "next/server";
import { calculateStakingComparison, calculateUserStakingComparison } from "@/lib/staking-comparison";

export const runtime = "edge";
export const revalidate = 60; // Cache for 1 minute

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const amountParam = searchParams.get("amount");

    if (amountParam) {
      // Calculate for specific user amount
      const userStakeNear = parseFloat(amountParam);
      if (isNaN(userStakeNear) || userStakeNear <= 0) {
        return NextResponse.json(
          { success: false, error: "Invalid amount parameter" },
          { status: 400 }
        );
      }
      
      const comparison = await calculateUserStakingComparison(userStakeNear);
      return NextResponse.json({
        success: true,
        data: comparison,
      });
    }

    // Calculate pool-wide comparison
    const comparison = await calculateStakingComparison();
    return NextResponse.json({
      success: true,
      data: comparison,
    });
  } catch (error) {
    console.error("Error calculating comparison:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
