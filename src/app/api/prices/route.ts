import { NextResponse } from "next/server";
import { getNearPriceUsd, getNproPriceUsd } from "@/lib/near";

export const runtime = "edge";
export const revalidate = 60; // Cache for 1 minute

export async function GET() {
  try {
    const [nearPrice, nproPrice] = await Promise.allSettled([
      getNearPriceUsd(),
      getNproPriceUsd(),
    ]);

    const nearPriceUsd =
      nearPrice.status === "fulfilled" ? nearPrice.value : null;
    const nproPriceUsd =
      nproPrice.status === "fulfilled" ? nproPrice.value : null;

    const nproPriceInNear =
      nearPriceUsd && nproPriceUsd ? nproPriceUsd / nearPriceUsd : null;

    return NextResponse.json({
      success: true,
      data: {
        near: {
          usd: nearPriceUsd,
          source: "peersyst-coingecko-cached",
        },
        npro: {
          usd: nproPriceUsd,
          near: nproPriceInNear,
          source: "cmc-cg-api",
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching prices:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
