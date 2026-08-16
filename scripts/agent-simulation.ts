import { createPublicClient, createWalletClient, http, parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
const VALIDATOR_ADDRESS = (process.env.VALIDATOR_ADDRESS || "0x8d03dfc8516c4Ee0f56B99D5E0000726cE57732A") as `0x${string}`;
const RPC_URL = "https://testnet-rpc.monad.xyz";

const ALLOWED_TARGET = "0x1234567890123456789012345678901234567890" as `0x${string}`;
const BLOCKED_TARGET = "0x9999999999999999999999999999999999999999" as `0x${string}`;

// Demo session key
const SESSION_KEY = "0x1111111111111111111111111111111111111111" as `0x${string}`;
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
    name: "createSession",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sessionKey", type: "address" },
      { name: "maxNativeSpend", type: "uint256" },
      { name: "validUntil", type: "uint48" },
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
    name: "validateSession",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "sessionKey", type: "address" },
      { name: "target", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
  {
    name: "recordSessionSpend",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "account", type: "address" },
      { name: "sessionKey", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "getSessionRemainingSpend",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "sessionKey", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

async function main() {
  if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not set");

  const account = privateKeyToAccount(PRIVATE_KEY);

  const publicClient = createPublicClient({ transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, transport: http(RPC_URL) });

  console.log("\n=== Session Policy Wallet - Agent Simulation ===");
  console.log("Account:", account.address);
  console.log("Validator:", VALIDATOR_ADDRESS);

  async function sendAndWait(hash: `0x${string}`, label: string) {
    console.log(`${label} Tx:`, hash);
    console.log("Waiting for confirmation...");
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log("Confirmed in block:", receipt.blockNumber.toString());
  }

  async function showRemaining(label: string) {
    const remaining = await publicClient.readContract({
      address: VALIDATOR_ADDRESS,
      abi,
      functionName: "getSessionRemainingSpend",
      args: [account.address, SESSION_KEY],
    });
    console.log(`  → Remaining spend (${label}): ${formatEther(remaining)} MON`);
    return remaining;
  }

  // 1. Set owner policy
  console.log("\n[1] Setting owner policy: max 0.05 MON...");
  const p1 = await walletClient.writeContract({
    address: VALIDATOR_ADDRESS,
    abi,
    functionName: "setPolicy",
    args: [parseEther("0.05")],
    chain: null,
  });
  await sendAndWait(p1, "setPolicy");

  // 2. Allow target
  console.log("\n[2] Allowing target:", ALLOWED_TARGET);
  const p2 = await walletClient.writeContract({
    address: VALIDATOR_ADDRESS,
    abi,
    functionName: "setAllowedTarget",
    args: [ALLOWED_TARGET, true],
    chain: null,
  });
  await sendAndWait(p2, "setAllowedTarget");

  // 3. Create session
  console.log("\n[3] Creating session key with 0.03 MON limit...");
  const p3 = await walletClient.writeContract({
    address: VALIDATOR_ADDRESS,
    abi,
    functionName: "createSession",
    args: [SESSION_KEY, parseEther("0.03"), 0],
    chain: null,
  });
  await sendAndWait(p3, "createSession");

  // Show initial remaining spend
  await showRemaining("after creation");

  // 4. Valid session action — validate, record spend, check remaining
  console.log("\n[4] Testing VALID session action (0.01 MON)...");
  const valid1 = await publicClient.readContract({
    address: VALIDATOR_ADDRESS,
    abi,
    functionName: "validateSession",
    args: [account.address, SESSION_KEY, ALLOWED_TARGET, parseEther("0.01")],
  });
  console.log("  Validation:", valid1 ? "ALLOWED ✓" : "REJECTED ✗");

  if (valid1) {
    console.log("  Recording spend of 0.01 MON...");
    const rs1 = await walletClient.writeContract({
      address: VALIDATOR_ADDRESS,
      abi,
      functionName: "recordSessionSpend",
      args: [account.address, SESSION_KEY, parseEther("0.01")],
      chain: null,
    });
    await sendAndWait(rs1, "recordSessionSpend");
    await showRemaining("after 0.01 MON spend");
  }

  // 5. Second valid action — validate, record, check remaining again
  console.log("\n[5] Testing second VALID action (0.01 MON)...");
  const valid2 = await publicClient.readContract({
    address: VALIDATOR_ADDRESS,
    abi,
    functionName: "validateSession",
    args: [account.address, SESSION_KEY, ALLOWED_TARGET, parseEther("0.01")],
  });
  console.log("  Validation:", valid2 ? "ALLOWED ✓" : "REJECTED ✗");

  if (valid2) {
    console.log("  Recording spend of 0.01 MON...");
    const rs2 = await walletClient.writeContract({
      address: VALIDATOR_ADDRESS,
      abi,
      functionName: "recordSessionSpend",
      args: [account.address, SESSION_KEY, parseEther("0.01")],
      chain: null,
    });
    await sendAndWait(rs2, "recordSessionSpend");
    await showRemaining("after 0.02 MON total spent");
  }

  // 6. Over-spend: try to spend more than the remaining limit
  console.log("\n[6] Testing MALICIOUS action (0.05 MON — exceeds remaining)...");
  const over = await publicClient.readContract({
    address: VALIDATOR_ADDRESS,
    abi,
    functionName: "validateSession",
    args: [account.address, SESSION_KEY, ALLOWED_TARGET, parseEther("0.05")],
  });
  console.log("  Result:", over ? "ALLOWED ✓" : "REJECTED ✗ (Spend Limit Exceeded)");

  // 7. Blocked target
  console.log("\n[7] Testing MALICIOUS action (blocked target)...");
  const blocked = await publicClient.readContract({
    address: VALIDATOR_ADDRESS,
    abi,
    functionName: "validateSession",
    args: [account.address, SESSION_KEY, BLOCKED_TARGET, parseEther("0.01")],
  });
  console.log("  Result:", blocked ? "ALLOWED ✓" : "REJECTED ✗ (Target Not Allowed)");

  // Final remaining spend
  await showRemaining("final");
  console.log("\n=== Demo Complete ===\n");
}

main().catch(console.error);