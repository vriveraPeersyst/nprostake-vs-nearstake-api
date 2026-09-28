export default function Home() {
  return (
    <main className="min-h-screen p-8 bg-gray-900 text-white">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-4">
          NPRO Staking vs NEAR Staking Comparison API
        </h1>
        <p className="text-gray-400 mb-8">
          Compare staking rewards between NPRO pool (npro.poolv1.near) and regular NEAR staking (APY derived from on-chain inflation and total stake).
        </p>

        <div className="space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">API Endpoints</h2>

            <div className="space-y-6">
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-xl font-medium text-green-400 mb-2">
                  GET /api/compare
                </h3>
                <p className="text-gray-400 mb-4">
                  Compare NPRO pool rewards vs regular NEAR staking rewards in USD terms.
                </p>
                <div className="bg-gray-900 p-4 rounded">
                  <p className="text-sm text-gray-500 mb-2">Query Parameters:</p>
                  <ul className="text-sm text-gray-400 list-disc list-inside">
                    <li>
                      <code className="text-yellow-400">amount</code> - Your staked NEAR amount (optional, returns user-specific rewards)
                    </li>
                  </ul>
                </div>
                <div className="mt-4">
                  <a
                    href="/api/compare"
                    className="text-blue-400 hover:underline"
                    target="_blank"
                  >
                    Try it →
                  </a>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-xl font-medium text-green-400 mb-2">
                  GET /api/validators
                </h3>
                <p className="text-gray-400 mb-4">
                  Get current validator and NPRO pool information.
                </p>
                <div className="mt-4">
                  <a
                    href="/api/validators"
                    className="text-blue-400 hover:underline"
                    target="_blank"
                  >
                    Try it →
                  </a>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-xl font-medium text-green-400 mb-2">
                  GET /api/prices
                </h3>
                <p className="text-gray-400 mb-4">
                  Get current NEAR and NPRO prices in USD.
                </p>
                <div className="mt-4">
                  <a
                    href="/api/prices"
                    className="text-blue-400 hover:underline"
                    target="_blank"
                  >
                    Try it →
                  </a>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Response Example</h2>
            <pre className="bg-gray-800 p-4 rounded-lg overflow-x-auto text-sm">
              {JSON.stringify(
                {
                  success: true,
                  data: {
                    epoch: {
                      current: 100,
                      next: 101,
                      blocksPerEpoch: 43200,
                      epochDurationHours: 7.48,
                    },
                    pool: {
                      poolId: "npro.poolv1.near",
                      totalStakedNear: 100000,
                      totalStakedUsd: 530000,
                    },
                    nearStaking: {
                      apyPercent: 4.27,
                      nearEarnedPerEpoch: 3.84,
                      nearEarnedPerEpochUsd: 20.35,
                    },
                    nproStaking: {
                      nproDistributedPerEpoch: 1892.5,
                      nproDistributedPerEpochUsd: 1290.76,
                    },
                    comparison: {
                      differenceUsd: 1270.41,
                      differencePercent: 6243.15,
                      betterOption: "npro",
                      summary: "NPRO staking is 6243.15% better (+$1270.41 per epoch)",
                    },
                    prices: {
                      nearUsd: 5.3,
                      nproUsd: 0.68,
                    },
                  },
                },
                null,
                2
              )}
            </pre>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">How It Works</h2>
            <ol className="list-decimal list-inside text-gray-400 space-y-2">
              <li>Fetches current block and calculates epoch number from NEAR RPC</li>
              <li>Gets total NEAR staked in npro.poolv1.near</li>
              <li>Fetches NEAR price from CoinGecko and NPRO price from custom API</li>
              <li>Calculates the NEAR staking APY from on-chain data: (1 − treasury share) × inflation × total supply / total stake, compounded each epoch</li>
              <li>Calculates NPRO distributed per epoch using the bonding curve: R(t) = R₀ × e^(-λt)</li>
              <li>Compares USD value of rewards and returns percentage difference</li>
            </ol>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Bonding Curve</h2>
            <div className="bg-gray-800 p-4 rounded-lg">
              <p className="text-gray-400 mb-2">NPRO distribution follows an exponential decay curve:</p>
              <p className="text-xl font-mono text-green-400">R(t) = 1892.82 × e^(-0.000237 × t)</p>
              <p className="text-gray-500 mt-2 text-sm">Where t is the epoch number since distribution started.</p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
