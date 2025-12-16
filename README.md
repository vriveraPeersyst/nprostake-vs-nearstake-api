# NPRO Staking vs NEAR Staking Comparison API

A Vercel API built with Next.js and TypeScript that compares staking rewards between:
- **NPRO Pool** (`npro.poolv1.near`) - Rewards in NPRO tokens based on bonding curve with decay
- **Regular NEAR Staking** - Direct NEAR rewards at 4.5% APY from a 0% fee validator

## Live Demo

Deploy to Vercel and access the API endpoints.

## How It Works

The API compares the **USD value** of rewards, accounting for bonding curve decay over time:

### NEAR Staking Rewards
- Fixed 4.5% APY
- Rewards compound each epoch (~7.5 hours)

### NPRO Staking Rewards  
- Follows exponential decay bonding curve: `R(t) = R₀ × e^(-λt)`
- R₀ = 1892.824882239740 NPRO per epoch (initial)
- λ = 0.00023664977144416 (decay rate)
- **Yearly rewards calculated by summing all epochs with decay**

### Comparison
- Per-epoch: `(NPRO rewards × NPRO price) vs (NEAR rewards × NEAR price)`
- Yearly: Sums ~1170 epochs accounting for decay to calculate effective APY

## API Endpoints

### `GET /api/compare`

Main endpoint to compare staking options with full decay calculations.

**Query Parameters:**
- `amount` (optional): Your staked NEAR amount for user-specific rewards

**Examples:**
```bash
# Pool-wide comparison
curl "https://your-api.vercel.app/api/compare"

# User-specific (1000 NEAR staked)
curl "https://your-api.vercel.app/api/compare?amount=1000"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "epoch": {
      "current": 100,
      "next": 101,
      "blocksPerEpoch": 43200,
      "epochDurationHours": 7.48,
      "epochsPerYear": 1170
    },
    "pool": {
      "poolId": "npro.poolv1.near",
      "totalStakedNear": 100000,
      "totalStakedUsd": 530000
    },
    "nearStaking": {
      "apyPercent": 4.5,
      "nearEarnedPerEpoch": 3.84,
      "nearEarnedPerEpochUsd": 20.35,
      "nearEarnedPerYear": 4500,
      "nearEarnedPerYearUsd": 23850
    },
    "nproStaking": {
      "nproDistributedNextEpoch": 1892.5,
      "nproDistributedNextEpochUsd": 1290.76,
      "nproDistributedPerYear": 2200000,
      "nproDistributedPerYearUsd": 1496000,
      "effectiveApyPercent": 282.5
    },
    "perEpochComparison": {
      "differenceUsd": 1270.41,
      "differencePercent": 6243.15,
      "betterOption": "npro"
    },
    "yearlyComparison": {
      "differenceUsd": 1472150,
      "differencePercent": 6172.5,
      "betterOption": "npro",
      "summary": "NPRO staking yields 282.5% effective APY vs NEAR's 4.5%"
    },
    "prices": {
      "nearUsd": 5.3,
      "nproUsd": 0.68
    }
  }
}
```

### `GET /api/prices`

Get current token prices.

```json
{
  "success": true,
  "data": {
    "near": { "usd": 5.3, "source": "coingecko" },
    "npro": { "usd": 0.68, "near": 0.128, "source": "cmc-cg-api" }
  }
}
```

### `GET /api/validators`

Get NEAR network validator information and NPRO pool status.

## Price Sources

| Token | Source | Endpoint |
|-------|--------|----------|
| NEAR | CoinGecko | `api.coingecko.com/api/v3/simple/price` |
| NPRO | Custom API | `cmc-cg-api.vercel.app/api/v1/token/npro` |

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Deployment to Vercel

### Option 1: Vercel CLI
```bash
npm i -g vercel
vercel
```

### Option 2: GitHub Integration
1. Push to GitHub
2. Import project in [vercel.com/new](https://vercel.com/new)
3. Deploy automatically on push

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── compare/route.ts   # Main comparison endpoint
│   │   ├── prices/route.ts    # Token prices
│   │   └── validators/route.ts # Network info
│   ├── page.tsx               # Documentation page
│   └── layout.tsx
└── lib/
    ├── bonding-curve.ts       # NPRO decay calculations
    ├── near.ts                # RPC & price fetching
    └── staking-comparison.ts  # Core comparison logic
```

## Key Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `BLOCKS_PER_EPOCH` | 43,200 | Blocks in one epoch |
| `DEFAULT_BLOCK_TIME` | 0.623s | Average block time |
| `NPRO_START_BLOCK` | 164,137,435 | NPRO distribution start |
| `NEAR_STAKING_APY` | 4.5% | Standard validator APY |
| `R₀` | 1892.82 | Initial NPRO per epoch |
| `λ` | 0.000237 | Decay rate |

## License

MIT
