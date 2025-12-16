const NEAR_RPC_URL = "https://rpc.mainnet.near.org";
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const NPRO_PRICE_API = "https://cmc-cg-api.vercel.app/api/v1/token/npro";

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
 * Get NEAR price in USD from CoinGecko
 */
export async function getNearPriceUsd(): Promise<number> {
  try {
    const response = await fetch(
      `${COINGECKO_API}/simple/price?ids=near&vs_currencies=usd`
    );
    
    if (!response.ok) {
      throw new Error("Failed to fetch NEAR price from CoinGecko");
    }
    
    const data = await response.json();
    return data.near.usd;
  } catch (error) {
    console.error("Error fetching NEAR price:", error);
    throw error;
  }
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
