import { createPublicClient, createWalletClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ============ CONFIG ============
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
const VALIDATOR_ADDRESS = "0xB30590F0A912B6B8A9F13a9Db9C2AAD3275A311b" as `0x${string}`;
const RPC_URL = "https://testnet-rpc.monad.xyz";

const ALLOWED_TARGET = "0x1234567890123456789012345678901234567890" as `0x${string}`;
const BLOCKED_TARGET = "0x9999999999999999999999999999999999999999" as `0x${string}`;

const abi = [
  {
    name: "setPolicy",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "maxNativeSpend", type: "uint256" }],
    outputs: [],
  },
  {
    name: "setAllowedTarget",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "target", type: "address" },
      { name: "allowed", type: "bool" },
    ],
    outputs: [],
  },
  {
    name: "validate",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "target", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
  {
    name: "getRemainingSpend",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

async function main() {
  if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not set");

  const account = privateKeyToAccount(PRIVATE_KEY);

  const publicClient = createPublicClient({
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    transport: http(RPC_URL),
  });

  console.log("\n=== Session Policy Wallet - Agent Simulation ===");
  console.log("Account:", account.address);
  console.log("Validator:", VALIDATOR_ADDRESS);

  // Helper to send and wait
  async function sendAndWait(txHash: `0x${string}`, label: string) {
    console.log(`${label} Tx:`, txHash);
    console.log("Waiting for confirmation...");
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log("Confirmed in block:", receipt.blockNumber);
    return receipt;
  }

  // 1. Set Policy
  console.log("\n[1] Setting policy: max 0.05 MON...");
  const setPolicyHash = await walletClient.writeContract({
    address: VALIDATOR_ADDRESS,
    abi,
    functionName: "setPolicy",
    args: [parseEther("0.05")],
    chain: null,
  });
  await sendAndWait(setPolicyHash, "setPolicy");

  // 2. Allow target
  console.log("\n[2] Allowing target:", ALLOWED_TARGET);
  const allowHash = await walletClient.writeContract({
    address: VALIDATOR_ADDRESS,
    abi,
    functionName: "setAllowedTarget",
    args: [ALLOWED_TARGET, true],
    chain: null,
  });
  await sendAndWait(allowHash, "setAllowedTarget");

  // 3. Test VALID action
  console.log("\n[3] Testing VALID action (0.01 MON → allowed target)...");
  const valid = await publicClient.readContract({
    address: VALIDATOR_ADDRESS,
    abi,
    functionName: "validate",
    args: [account.address, ALLOWED_TARGET, parseEther("0.01")],
  });
  console.log("Result:", valid ? "ALLOWED" : "REJECTED");

  // 4. Test OVER SPEND
  console.log("\n[4] Testing MALICIOUS action (0.1 MON - over limit)...");
  const overSpend = await publicClient.readContract({
    address: VALIDATOR_ADDRESS,
    abi,
    functionName: "validate",
    args: [account.address, ALLOWED_TARGET, parseEther("0.1")],
  });
  console.log("Result:", overSpend ? "ALLOWED" : "REJECTED (Spend Limit)");

  // 5. Test BLOCKED TARGET
  console.log("\n[5] Testing MALICIOUS action (blocked target)...");
  const blocked = await publicClient.readContract({
    address: VALIDATOR_ADDRESS,
    abi,
    functionName: "validate",
    args: [account.address, BLOCKED_TARGET, parseEther("0.01")],
  });
  console.log("Result:", blocked ? "ALLOWED" : "REJECTED (Target Not Allowed)");

  // 6. Remaining spend
  const remaining = await publicClient.readContract({
    address: VALIDATOR_ADDRESS,
    abi,
    functionName: "getRemainingSpend",
    args: [account.address],
  });
  console.log("\nRemaining spend:", formatEther(remaining), "MON");

  console.log("\n=== Demo Complete ===\n");
}

main().catch(console.error);