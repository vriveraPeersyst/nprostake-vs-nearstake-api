const NEAR_RPC_URL = "https://rpc.mainnet.near.org";
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const PEERSYST_PRICES_API = "https://near-mobile-production.aws.peersyst.tech/api/market";
const NPRO_PRICE_API = "https://cmc-cg-api.vercel.app/api/v1/token/npro";

// In-memory price cache (survives across requests in the same serverless instance)
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
let nearPriceCache: { price: number; timestamp: number } | null = null;

export interface RpcResponse<T> {
  jsonrpc: string;
  id: string;
  result: T;
}

export interface ValidatorInfo {
  account_id: string;
  is_slashed: boolean;
  num_expected_blocks: number;
  num_expected_chunks: number;
  num_produced_blocks: number;
  num_produced_chunks: number;
  public_key: string;
  shards: number[];
  stake: string;
}

export interface EpochValidatorsResult {
  current_validators: ValidatorInfo[];
  next_validators: ValidatorInfo[];
  epoch_height: number;
  epoch_start_height: number;
}

export interface PoolInfo {
  total_staked_balance: string;
  owner_id: string;
  reward_fee_fraction: {
    numerator: number;
    denominator: number;
  };
}

export interface NproPriceResponse {
  symbol: string;
  name: string;
  currency: string;
  price: string;
  last_updated: string;
}

export async function rpcCall<T>(method: string, params: unknown): Promise<T> {
  const response = await fetch(NEAR_RPC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "dontcare",
      method,
      params,
    }),
  });

  const data = (await response.json()) as RpcResponse<T>;
  
  if (!data.result) {
    throw new Error(`RPC call failed: ${JSON.stringify(data)}`);
  }
  
  return data.result;
}

export async function viewCall<T>(
  contractId: string,
  methodName: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const argsBase64 = Buffer.from(JSON.stringify(args)).toString("base64");
  
  const result = await rpcCall<{ result: number[] }>("query", {
    request_type: "call_function",
    finality: "final",
    account_id: contractId,
    method_name: methodName,
    args_base64: argsBase64,
  });

  const resultString = String.fromCharCode(...result.result);
  return JSON.parse(resultString) as T;
}

export async function getValidators(): Promise<EpochValidatorsResult> {
  return rpcCall<EpochValidatorsResult>("validators", [null]);
}

export async function getPoolInfo(poolId: string): Promise<PoolInfo> {
  const [totalStaked, ownerId, rewardFee] = await Promise.all([
    viewCall<string>(poolId, "get_total_staked_balance"),
    viewCall<string>(poolId, "get_owner_id"),
    viewCall<{ numerator: number; denominator: number }>(poolId, "get_reward_fee_fraction"),
  ]);

  return {
    total_staked_balance: totalStaked,
    owner_id: ownerId,
    reward_fee_fraction: rewardFee,
  };
}

export function yoctoToNear(yoctoNear: string): number {
  return parseFloat(yoctoNear) / 1e24;
}

export function formatNear(near: number): string {
  return near.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export async function getPoolTotalStaked(poolId: string): Promise<string> {
  return viewCall<string>(poolId, "get_total_staked_balance");
}

/**
 * Fetch NEAR price from Peersyst Prices API
 */
async function fetchNearPriceFromPeersyst(): Promise<number> {
  const response = await fetch(PEERSYST_PRICES_API);
  if (!response.ok) {
    throw new Error(`Peersyst API returned ${response.status}`);
  }
  const data: Array<{ id: string; usdPrice: string }> = await response.json();
  const nearEntry = data.find((item) => item.id === "near");
  if (!nearEntry) {
    throw new Error("NEAR not found in Peersyst API response");
  }
  const price = parseFloat(nearEntry.usdPrice);
  if (isNaN(price) || price <= 0) {
    throw new Error("Invalid NEAR price from Peersyst API");
  }
  return price;
}

/**
 * Fetch NEAR price from CoinGecko
 */
async function fetchNearPriceFromCoinGecko(): Promise<number> {
  const response = await fetch(
    `${COINGECKO_API}/simple/price?ids=near&vs_currencies=usd`
  );
  if (!response.ok) {
    throw new Error(`CoinGecko API returned ${response.status}`);
  }
  const data = await response.json();
  const price = data?.near?.usd;
  if (typeof price !== "number" || isNaN(price) || price <= 0) {
    throw new Error("Invalid NEAR price from CoinGecko");
  }
  return price;
}

/**
 * Get NEAR price in USD with caching and fallback sources.
 * Tries Peersyst API first, falls back to CoinGecko, then uses cache.
 */
export async function getNearPriceUsd(): Promise<number> {
  // Return cached price if still fresh
  if (nearPriceCache && Date.now() - nearPriceCache.timestamp < CACHE_TTL_MS) {
    return nearPriceCache.price;
  }

  const sources = [fetchNearPriceFromPeersyst, fetchNearPriceFromCoinGecko];

  for (const fetchFn of sources) {
    try {
      const price = await fetchFn();
      nearPriceCache = { price, timestamp: Date.now() };
      return price;
    } catch (error) {
      console.warn(`Price source failed: ${(error as Error).message}`);
    }
  }

  // All sources failed — use stale cache if available
  if (nearPriceCache) {
    console.warn("All price sources failed, using stale cached price");
    return nearPriceCache.price;
  }

  throw new Error("Failed to fetch NEAR price from all sources");
}

/**
 * Get NPRO price in USD from custom API
 */
export async function getNproPriceUsd(): Promise<number> {
  try {
    const response = await fetch(NPRO_PRICE_API);
    
    if (!response.ok) {
      throw new Error("Failed to fetch NPRO price");
    }
    
    const data: NproPriceResponse = await response.json();
    return parseFloat(data.price);
  } catch (error) {
    console.error("Error fetching NPRO price:", error);
    throw error;
  }
}

/**
 * Get both prices at once
 */
export async function getPrices(): Promise<{
  nearPriceUsd: number;
  nproPriceUsd: number;
}> {
  const [nearPriceUsd, nproPriceUsd] = await Promise.all([
    getNearPriceUsd(),
    getNproPriceUsd(),
  ]);
  
  return { nearPriceUsd, nproPriceUsd };
}
