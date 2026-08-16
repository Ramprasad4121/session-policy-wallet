"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseEther,
  formatEther,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { VALIDATOR_ADDRESS, MONAD_TESTNET, POLICY_VALIDATOR_ABI } from "@/lib/contract";
import {
  discoverWallets,
  hasAnyWalletProvider,
  type EIP1193Provider,
  type WalletOption,
} from "@/lib/wallets";

type LogEntry = {
  text: string;
  type: "info" | "success" | "error";
  timestamp: string;
};

type ValidationResult = {
  label: string;
  allowed: boolean;
  detail: string;
} | null;

const monadChain = {
  id: MONAD_TESTNET.id,
  name: MONAD_TESTNET.name,
  nativeCurrency: MONAD_TESTNET.nativeCurrency,
  rpcUrls: MONAD_TESTNET.rpcUrls,
  blockExplorers: MONAD_TESTNET.blockExplorers,
};

export default function Home() {
  // Connection state
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [publicClient, setPublicClient] = useState<PublicClient | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [hasProvider, setHasProvider] = useState<boolean | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletOptions, setWalletOptions] = useState<WalletOption[]>([]);
  const [loadingWallets, setLoadingWallets] = useState(false);
  const activeProviderRef = useRef<EIP1193Provider | null>(null);

  // Form state
  const [targetAddress, setTargetAddress] = useState("");
  const [sessionKeyAddress, setSessionKeyAddress] = useState("");
  const [spendLimit, setSpendLimit] = useState("");
  const [expiryMinutes, setExpiryMinutes] = useState("");

  // Session info
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionRemaining, setSessionRemaining] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<{
    maxSpend: string;
    spent: string;
    validUntil: number;
  } | null>(null);

  // Action state
  const [validResult, setValidResult] = useState<ValidationResult>(null);
  const [maliciousResult, setMaliciousResult] = useState<ValidationResult>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  
  // UI Helpers
  const [helpOpen, setHelpOpen] = useState<Record<string, boolean>>({});
  const toggleHelp = (key: string) => setHelpOpen((p) => ({ ...p, [key]: !p[key] }));

  const renderHelp = (key: string, text: string, alignRight = false) => {
    const isOpen = helpOpen[key];
    return (
      <div
        style={{
          marginTop: "4px",
          fontFamily: "var(--mono)",
          fontSize: "10px",
          textAlign: alignRight ? "right" : "left",
        }}
      >
        {!alignRight && (
          <button
            onClick={() => toggleHelp(key)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 0,
              fontFamily: "inherit",
              fontSize: "inherit",
            }}
            title="Toggle details"
          >
            {isOpen ? "[-]" : "[?]"}
          </button>
        )}
        {isOpen && (
          <span
            style={{
              color: "var(--text-dim)",
              marginLeft: alignRight ? 0 : "6px",
              marginRight: alignRight ? "6px" : 0,
              lineHeight: "1.4",
              fontFamily: "var(--sans)",
            }}
          >
            {text}
          </span>
        )}
        {alignRight && (
          <button
            onClick={() => toggleHelp(key)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 0,
              fontFamily: "inherit",
              fontSize: "inherit",
            }}
            title="Toggle details"
          >
            {isOpen ? "[-]" : "[?]"}
          </button>
        )}
      </div>
    );
  };

  const log = useCallback((text: string, type: LogEntry["type"] = "info") => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { text, type, timestamp: time }]);
  }, []);

  const setupClients = useCallback((addr: Address, provider: EIP1193Provider) => {
    activeProviderRef.current = provider;

    const pc = createPublicClient({
      chain: monadChain as any,
      transport: http(MONAD_TESTNET.rpcUrls.default.http[0]),
    });

    const wc = createWalletClient({
      account: addr,
      chain: monadChain as any,
      transport: custom(provider),
    });

    setAccount(addr);
    setPublicClient(pc as any);
    setWalletClient(wc as any);
  }, []);

  const switchChain = useCallback(async (providerOverride?: EIP1193Provider) => {
    const provider = providerOverride ?? activeProviderRef.current;
    if (!provider) return;

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${MONAD_TESTNET.id.toString(16)}` }],
      });
      log("Switched to Monad Testnet (Chain ID 10143)", "success");
      setChainId(MONAD_TESTNET.id);
    } catch (switchError: any) {
      const errCode =
        switchError?.code || switchError?.data?.originalError?.code;

      if (
        errCode === 4902 ||
        switchError?.message?.includes("Unrecognized chain ID") ||
        switchError?.message?.includes("4902")
      ) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: `0x${MONAD_TESTNET.id.toString(16)}`,
                chainName: MONAD_TESTNET.name,
                nativeCurrency: MONAD_TESTNET.nativeCurrency,
                rpcUrls: [MONAD_TESTNET.rpcUrls.default.http[0]],
                blockExplorerUrls: [MONAD_TESTNET.blockExplorers.default.url],
              },
            ],
          });
          log("Monad Testnet added to wallet", "success");
          setChainId(MONAD_TESTNET.id);
        } catch (addError: any) {
          log(
            `Could not add Monad chain: ${addError?.message || addError}`,
            "error"
          );
        }
      } else {
        log(
          `Chain switch failed: ${switchError?.message || switchError}`,
          "error"
        );
      }
    }
  }, [log]);

  // Auto-detect existing session
  useEffect(() => {
    if (typeof window === "undefined") return;

    setHasProvider(hasAnyWalletProvider());

    const ethereum = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (!ethereum) return;

    const provider =
      ethereum.providers && ethereum.providers.length === 1
        ? ethereum.providers[0]
        : ethereum;

    provider
      .request({ method: "eth_chainId" })
      .then((cId) => setChainId(parseInt(cId as string, 16)))
      .catch(() => {});

    provider
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const list = accounts as string[];
        if (list && list.length > 0) {
          const addr = list[0] as Address;
          setupClients(addr, provider);
          log(
            `Auto-connected: ${addr.slice(0, 6)}...${addr.slice(-4)}`,
            "success"
          );
        }
      })
      .catch(() => {});

    const handleAccountsChanged = (accounts: unknown) => {
      const list = accounts as string[];
      const active = activeProviderRef.current ?? provider;
      if (!list || list.length === 0) {
        setAccount(null);
        setWalletClient(null);
        activeProviderRef.current = null;
        log("Wallet disconnected", "info");
      } else {
        const addr = list[0] as Address;
        setupClients(addr, active);
        log(
          `Switched account: ${addr.slice(0, 6)}...${addr.slice(-4)}`,
          "info"
        );
      }
    };

    const handleChainChanged = (cId: unknown) => {
      setChainId(parseInt(cId as string, 16));
      log(`Chain changed to ${parseInt(cId as string, 16)}`, "info");
    };

    provider.on?.("accountsChanged", handleAccountsChanged);
    provider.on?.("chainChanged", handleChainChanged);

    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [setupClients, log]);

  const connectWithProvider = useCallback(
    async (wallet: WalletOption) => {
      if (!wallet.provider) {
        if (wallet.installUrl) {
          window.open(wallet.installUrl, "_blank", "noopener,noreferrer");
          log(`Opening ${wallet.name} install page`, "info");
        }
        return;
      }

      const ethereum = wallet.provider;
      setConnecting(true);
      setShowWalletModal(false);
      log(`Connecting via ${wallet.name}...`, "info");

      try {
        const tempClient = createWalletClient({
          transport: custom(ethereum),
        });

        const accounts = await tempClient.requestAddresses();

        if (!accounts || accounts.length === 0) {
          throw new Error("No accounts returned by wallet");
        }

        const addr = accounts[0] as Address;
        setupClients(addr, ethereum);
        log(`Connected via ${wallet.name}: ${addr}`, "success");
        switchChain(ethereum).catch(() => {});
      } catch (e: any) {
        if (
          e?.message?.toLowerCase?.().includes("not connected") ||
          e?.code === 4900
        ) {
          try {
            log("Attempting legacy connection...", "info");
            const legacyAccounts = await (ethereum as EIP1193Provider & {
              enable?: () => Promise<string[]>;
            }).enable?.();
            if (legacyAccounts && legacyAccounts.length > 0) {
              const addr = legacyAccounts[0] as Address;
              setupClients(addr, ethereum);
              log(`Connected via ${wallet.name}: ${addr}`, "success");
              switchChain(ethereum).catch(() => {});
              return;
            }
          } catch {
            // Fall through to user-facing error below.
          }
        }

        if (e?.code === 4001) {
          log("Connection rejected by user", "error");
        } else if (
          e?.message?.toLowerCase?.().includes("not connected") ||
          e?.message?.toLowerCase?.().includes("locked")
        ) {
          log(
            `Wallet is locked. Unlock ${wallet.name}, reload, and try again.`,
            "error"
          );
        } else {
          log(`Connection failed: ${e?.message || String(e)}`, "error");
        }
      } finally {
        setConnecting(false);
      }
    },
    [setupClients, switchChain, log]
  );

  const openWalletPicker = useCallback(async () => {
    setLoadingWallets(true);
    setShowWalletModal(true);

    try {
      const wallets = await discoverWallets();
      setWalletOptions(wallets);
    } catch {
      setWalletOptions([]);
      log("Could not detect wallet extensions", "error");
    } finally {
      setLoadingWallets(false);
    }
  }, [log]);

  // Refresh session info
  const refreshSession = useCallback(async () => {
    if (!publicClient || !account || !sessionKeyAddress) return;

    try {
      const key = sessionKeyAddress as Address;

      const active = (await publicClient.readContract({
        address: VALIDATOR_ADDRESS,
        abi: POLICY_VALIDATOR_ABI,
        functionName: "isSessionActive",
        args: [account, key],
      })) as boolean;

      const remaining = (await publicClient.readContract({
        address: VALIDATOR_ADDRESS,
        abi: POLICY_VALIDATOR_ABI,
        functionName: "getSessionRemainingSpend",
        args: [account, key],
      })) as bigint;

      const data = (await publicClient.readContract({
        address: VALIDATOR_ADDRESS,
        abi: POLICY_VALIDATOR_ABI,
        functionName: "sessions",
        args: [account, key],
      })) as any;

      setSessionActive(active);
      setSessionRemaining(formatEther(remaining));
      setSessionData({
        maxSpend: formatEther(data[1] || data.maxNativeSpend || BigInt(0)),
        spent: formatEther(data[2] || data.spent || BigInt(0)),
        validUntil: Number(data[4] || data.validUntil || 0),
      });
    } catch {
      setSessionActive(false);
      setSessionRemaining(null);
      setSessionData(null);
    }
  }, [publicClient, account, sessionKeyAddress]);

  useEffect(() => {
    if (account && sessionKeyAddress) {
      refreshSession();
    }
  }, [account, sessionKeyAddress, refreshSession]);

  const handleFillDemo = () => {
    setTargetAddress("0x1234567890123456789012345678901234567890");
    setSessionKeyAddress("0x1111111111111111111111111111111111111111");
    setSpendLimit("0.05");
    setExpiryMinutes("60");
    log("Demo parameters loaded", "info");
  };

  const handleSetTarget = useCallback(async () => {
    if (!walletClient || !publicClient || !account || !targetAddress) return;

    setLoading("target");
    try {
      const hash = await walletClient.writeContract({
        address: VALIDATOR_ADDRESS,
        abi: POLICY_VALIDATOR_ABI,
        functionName: "setAllowedTarget",
        args: [targetAddress as Address, true],
        chain: monadChain as any,
        account,
      });

      log(`setAllowedTarget tx: ${hash}`, "info");
      await publicClient.waitForTransactionReceipt({ hash });
      log(`Target allowed: ${targetAddress}`, "success");
    } catch (e: any) {
      log(`setAllowedTarget failed: ${e.shortMessage || e.message}`, "error");
    } finally {
      setLoading(null);
    }
  }, [walletClient, publicClient, account, targetAddress, log]);

  const handleCreateSession = useCallback(async () => {
    if (
      !walletClient ||
      !publicClient ||
      !account ||
      !sessionKeyAddress ||
      !spendLimit
    )
      return;

    setLoading("session");
    try {
      // Set policy first
      const policyHash = await walletClient.writeContract({
        address: VALIDATOR_ADDRESS,
        abi: POLICY_VALIDATOR_ABI,
        functionName: "setPolicy",
        args: [parseEther(spendLimit)],
        chain: monadChain as any,
        account,
      });
      log(`setPolicy tx: ${policyHash}`, "info");
      await publicClient.waitForTransactionReceipt({ hash: policyHash });
      log(`Policy set: ${spendLimit} MON`, "success");

      const validUntil = expiryMinutes
        ? Math.floor(Date.now() / 1000) + parseInt(expiryMinutes) * 60
        : 0;

      const hash = await walletClient.writeContract({
        address: VALIDATOR_ADDRESS,
        abi: POLICY_VALIDATOR_ABI,
        functionName: "createSession",
        args: [
          sessionKeyAddress as Address,
          parseEther(spendLimit),
          validUntil,
        ],
        chain: monadChain as any,
        account,
      });

      log(`createSession tx: ${hash}`, "info");
      await publicClient.waitForTransactionReceipt({ hash });
      log(
        `Session created: max ${spendLimit} MON ${
          validUntil ? `(expires in ${expiryMinutes}m)` : "(no expiry)"
        }`,
        "success"
      );

      await refreshSession();
    } catch (e: any) {
      log(`createSession failed: ${e.shortMessage || e.message}`, "error");
    } finally {
      setLoading(null);
    }
  }, [
    walletClient,
    publicClient,
    account,
    sessionKeyAddress,
    spendLimit,
    expiryMinutes,
    log,
    refreshSession,
  ]);

  const handleValidAction = useCallback(async () => {
    if (!publicClient || !account || !sessionKeyAddress || !targetAddress)
      return;

    setLoading("valid");
    setValidResult(null);

    try {
      const testAmount = parseEther("0.001");

      const ok = (await publicClient.readContract({
        address: VALIDATOR_ADDRESS,
        abi: POLICY_VALIDATOR_ABI,
        functionName: "validateSession",
        args: [
          account,
          sessionKeyAddress as Address,
          targetAddress as Address,
          testAmount,
        ],
      })) as boolean;

      setValidResult({
        label: "TEST 01: VALID ACTION (0.001 MON → ALLOWED TARGET)",
        allowed: ok,
        detail: ok
          ? "Policy verification succeeded. Spending within limit."
          : "Verification rejected by on-chain validator.",
      });

      if (ok && walletClient) {
        log("Recording spend on-chain...", "info");
        const hash = await walletClient.writeContract({
          address: VALIDATOR_ADDRESS,
          abi: POLICY_VALIDATOR_ABI,
          functionName: "recordSessionSpend",
          args: [account, sessionKeyAddress as Address, testAmount],
          chain: monadChain as any,
          account,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        log("Spend recorded: 0.001 MON deducted", "success");
        await refreshSession();
      }
    } catch (e: any) {
      log(`Validation error: ${e.shortMessage || e.message}`, "error");
    } finally {
      setLoading(null);
    }
  }, [
    publicClient,
    walletClient,
    account,
    sessionKeyAddress,
    targetAddress,
    log,
    refreshSession,
  ]);

  const handleMaliciousAction = useCallback(async () => {
    if (!publicClient || !account || !sessionKeyAddress) return;

    setLoading("malicious");
    setMaliciousResult(null);

    try {
      const blockedTarget =
        "0x9999999999999999999999999999999999999999" as Address;
      const testAmount = parseEther("999");

      const ok = (await publicClient.readContract({
        address: VALIDATOR_ADDRESS,
        abi: POLICY_VALIDATOR_ABI,
        functionName: "validateSession",
        args: [
          account,
          sessionKeyAddress as Address,
          blockedTarget,
          testAmount,
        ],
      })) as boolean;

      setMaliciousResult({
        label: "TEST 02: MALICIOUS ACTION (999 MON → UNAPPROVED TARGET)",
        allowed: ok,
        detail: ok
          ? "CRITICAL: Malicious action was unexpectedly allowed."
          : "FAIL-CLOSED: Action blocked. Target not allowed + spend limit exceeded.",
      });
    } catch (e: any) {
      log(`Validation error: ${e.shortMessage || e.message}`, "error");
    } finally {
      setLoading(null);
    }
  }, [publicClient, account, sessionKeyAddress, log]);

  let nextSection = 1;
  const policySection = nextSection++;
  const statusSection = sessionData ? nextSection++ : null;
  const testsSection = account && sessionKeyAddress ? nextSection++ : null;
  const networkSection = nextSection++;
  const auditSection = logs.length > 0 ? nextSection++ : null;
  const formatSection = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="wrapper">
      <header>
        <div>
          <div className="brand-title">
            SESSION POLICY WALLET
            <span className="brand-tag">MVP v0.1</span>
          </div>
          <div className="brand-subtitle">
            Specification & Policy Verification for Monad Testnet (Chain ID
            10143)
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {account ? (
            <>
              {chainId !== MONAD_TESTNET.id && (
                <button
                  className="btn btn-sm"
                  style={{ border: "1px dashed #000", fontSize: "10px" }}
                  onClick={() => switchChain()}
                >
                  [SWITCH TO MONAD]
                </button>
              )}
              <button
                className="btn-connect connected"
                onClick={() => {
                  setAccount(null);
                  setWalletClient(null);
                  activeProviderRef.current = null;
                  log("Disconnected", "info");
                }}
                title="Click to disconnect"
              >
                [CONNECTED] {account.slice(0, 6)}...{account.slice(-4)}
              </button>
            </>
          ) : (
            <button
              className="btn-connect"
              onClick={openWalletPicker}
              disabled={connecting}
            >
              {connecting ? "CONNECTING..." : "CONNECT WALLET"}
            </button>
          )}
        </div>
      </header>

      {hasProvider === false && (
        <div
          style={{
            padding: "10px",
            border: "1px solid #000",
            marginBottom: "20px",
            fontFamily: "var(--mono)",
            fontSize: "11px",
          }}
        >
          [NOTICE] No Web3 wallet extension detected. Click CONNECT WALLET to
          see install options for MetaMask, Rabby, and others.
        </div>
      )}

      {showWalletModal && (
        <div
          className="wallet-modal-backdrop"
          onClick={() => !connecting && setShowWalletModal(false)}
          role="presentation"
        >
          <div
            className="wallet-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="wallet-modal-header">
              <div className="wallet-modal-title" id="wallet-modal-title">
                Connect a Wallet
              </div>
              <button
                type="button"
                className="wallet-modal-close"
                onClick={() => setShowWalletModal(false)}
                aria-label="Close wallet picker"
              >
                ×
              </button>
            </div>
            <div className="wallet-modal-body">
              <div className="wallet-modal-subtitle">
                Choose which wallet to connect. Only installed extensions can
                connect; others link to install pages.
              </div>
              {loadingWallets ? (
                <div className="wallet-modal-subtitle">Detecting wallets...</div>
              ) : walletOptions.length === 0 ? (
                <div className="wallet-modal-subtitle">
                  No wallets found. Install MetaMask or Rabby, then reload.
                </div>
              ) : (
                walletOptions.map((wallet) => (
                  <button
                    key={wallet.id}
                    type="button"
                    className="wallet-option"
                    onClick={() => connectWithProvider(wallet)}
                    disabled={connecting}
                  >
                    <div className="wallet-option-icon">
                      {wallet.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={wallet.icon} alt="" />
                      ) : (
                        wallet.name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="wallet-option-info">
                      <div className="wallet-option-name">{wallet.name}</div>
                      <div className="wallet-option-status">
                        {wallet.installed ? "Detected" : "Not installed"}
                      </div>
                    </div>
                    <div className="wallet-option-action">
                      {wallet.installed ? "Connect" : "Install"}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <main>
        {/* 01. Policy Configuration */}
        <section className="section">
          <div className="section-header">
            <div className="section-title">
              {formatSection(policySection)}. Policy Configuration
            </div>
            <div style={{ textAlign: "right" }}>
              <button
                onClick={handleFillDemo}
                style={{
                  background: "transparent",
                  border: "none",
                  fontFamily: "var(--mono)",
                  fontSize: "11px",
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
              >
                [AUTO-FILL DEMO INPUTS]
              </button>
              {renderHelp("demo", "Fills the form with example values for quick testing.", true)}
            </div>
          </div>

          <div className="grid-2">
            <div className="box">
              <div className="box-title">Target Contract Allowlist</div>
              <div className="form-group">
                <label className="form-label" htmlFor="target-address-input">
                  Contract Address
                </label>
                <input
                  id="target-address-input"
                  className="form-input"
                  placeholder="0x1234567890123456789012345678901234567890"
                  value={targetAddress}
                  onChange={(e) => setTargetAddress(e.target.value)}
                />
              </div>
              <button
                className="btn btn-sm"
                onClick={handleSetTarget}
                disabled={!account || !targetAddress || loading === "target"}
              >
                {loading === "target" ? "SETTING ON-CHAIN..." : "ALLOW TARGET"}
              </button>
              {renderHelp("target", "Adds this contract to the allowlist. Session keys can only interact with allowed contracts.")}
            </div>

            <div className="box">
              <div className="box-title">Session Key Registration</div>
              <div className="form-group">
                <label className="form-label" htmlFor="session-key-input">
                  Session Key (Agent Address)
                </label>
                <input
                  id="session-key-input"
                  className="form-input"
                  placeholder="0x..."
                  value={sessionKeyAddress}
                  onChange={(e) => setSessionKeyAddress(e.target.value)}
                />
              </div>
              <div className="flex-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label" htmlFor="spend-limit-input">
                    Spend Limit (MON)
                  </label>
                  <input
                    id="spend-limit-input"
                    className="form-input"
                    placeholder="0.05"
                    value={spendLimit}
                    onChange={(e) => setSpendLimit(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label" htmlFor="expiry-minutes-input">
                    TTL (Minutes)
                  </label>
                  <input
                    id="expiry-minutes-input"
                    className="form-input"
                    placeholder="0 = unlimited"
                    value={expiryMinutes}
                    onChange={(e) => setExpiryMinutes(e.target.value)}
                  />
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={handleCreateSession}
                disabled={
                  !account ||
                  !sessionKeyAddress ||
                  !spendLimit ||
                  loading === "session"
                }
              >
                {loading === "session"
                  ? "BROADCASTING..."
                  : "REGISTER SESSION"}
              </button>
              {renderHelp("session", "Creates a restricted session key with a spend limit and optional expiry. Give this key to an agent.")}
            </div>
          </div>
        </section>

        {/* 02. Active Policy Status */}
        {sessionData && (
          <section className="section">
            <div className="section-header">
              <div className="section-title">
                {formatSection(statusSection!)}. Active Policy Status
              </div>
              <div className="section-subtitle">
                Real-time state from PolicyValidator
              </div>
            </div>

            <div className="box">
              <table className="data-table">
                <tbody>
                  <tr>
                    <td className="label">SESSION STATE</td>
                    <td className="value">
                      <span
                        className={`badge ${
                          sessionActive ? "badge-active" : "badge-inactive"
                        }`}
                      >
                        {sessionActive ? "ACTIVE" : "INACTIVE / EXPIRED"}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="label">SESSION KEY</td>
                    <td className="value">{sessionKeyAddress}</td>
                  </tr>
                  <tr>
                    <td className="label">ALLOCATED CEILING</td>
                    <td className="value">{sessionData.maxSpend} MON</td>
                  </tr>
                  <tr>
                    <td className="label">CUMULATIVE SPENT</td>
                    <td className="value">{sessionData.spent} MON</td>
                  </tr>
                  <tr>
                    <td className="label">REMAINING SPEND BUDGET</td>
                    <td className="value" style={{ fontWeight: 600 }}>
                      {sessionRemaining} MON
                    </td>
                  </tr>
                  {sessionData.validUntil > 0 && (
                    <tr>
                      <td className="label">EXPIRY TIMESTAMP</td>
                      <td className="value">
                        {new Date(
                          sessionData.validUntil * 1000
                        ).toUTCString()}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 03. Policy Execution Tests */}
        {account && sessionKeyAddress && (
          <section className="section">
            <div className="section-header">
              <div className="section-title">
                {formatSection(testsSection!)}. Policy Execution Tests
              </div>
              <div className="section-subtitle">
                Validate transactions against fail-closed rules
              </div>
            </div>

            <div className="grid-2">
              <div>
                <button
                  className="btn"
                  onClick={handleValidAction}
                  disabled={loading === "valid"}
                >
                  {loading === "valid"
                    ? "VALIDATING..."
                    : "[+] EXECUTE VALID ACTION"}
                </button>
                {renderHelp("valid", "Simulates a normal allowed action (small spend to an approved contract). Should return ALLOWED.")}
              </div>
              <div>
                <button
                  className="btn"
                  onClick={handleMaliciousAction}
                  disabled={loading === "malicious"}
                >
                  {loading === "malicious"
                    ? "VALIDATING..."
                    : "[!] EXECUTE MALICIOUS ACTION"}
                </button>
                {renderHelp("malicious", "Simulates an attack: large spend + unapproved contract. Should return REJECTED.")}
              </div>
            </div>

            {validResult && (
              <div className="test-box">
                <div className="test-result-header">
                  <span>{validResult.label}</span>
                  <span
                    className={`status-tag ${
                      validResult.allowed ? "allowed" : "rejected"
                    }`}
                  >
                    {validResult.allowed ? "ALLOWED" : "REJECTED"}
                  </span>
                </div>
                <div className="test-detail">{validResult.detail}</div>
              </div>
            )}

            {maliciousResult && (
              <div className="test-box">
                <div className="test-result-header">
                  <span>{maliciousResult.label}</span>
                  <span
                    className={`status-tag ${
                      maliciousResult.allowed ? "allowed" : "rejected"
                    }`}
                  >
                    {maliciousResult.allowed ? "ALLOWED" : "REJECTED"}
                  </span>
                </div>
                <div className="test-detail">{maliciousResult.detail}</div>
              </div>
            )}
          </section>
        )}

        {/* 04. Network Info */}
        <section className="section">
          <div className="section-header">
            <div className="section-title">
              {formatSection(networkSection)}. Network & Protocol Info
            </div>
            <div className="section-subtitle">
              Monad Testnet Contract Details
            </div>
          </div>
          <div className="box">
            <table className="data-table">
              <tbody>
                <tr>
                  <td className="label">VALIDATOR CONTRACT</td>
                  <td className="value">{VALIDATOR_ADDRESS}</td>
                </tr>
                <tr>
                  <td className="label">NETWORK</td>
                  <td className="value">
                    Monad Testnet (Chain ID 10143)
                  </td>
                </tr>
                <tr>
                  <td className="label">RPC ENDPOINT</td>
                  <td className="value">
                    {MONAD_TESTNET.rpcUrls.default.http[0]}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 05. Audit Log */}
        {logs.length > 0 && (
          <section className="section">
            <div className="section-header">
              <div className="section-title">
                {formatSection(auditSection!)}. Audit Log
              </div>
              <div className="section-subtitle">
                Real-time RPC transactions and status changes
              </div>
            </div>
            <div
              className="terminal"
              role="log"
              aria-live="polite"
              aria-label="Audit log"
            >
              {logs.map((entry, i) => (
                <div key={i} className={`terminal-line ${entry.type}`}>
                  <span className="prefix">[{entry.timestamp}]</span>
                  <span>{entry.text}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer>
        <div>SESSION POLICY WALLET / AUDITABLE SECURITY ENGINE</div>
        <div>
          <a
            href="https://github.com/Ramprasad4121/session-policy-wallet"
            target="_blank"
            rel="noopener noreferrer"
          >
            GITHUB REPOSITORY
          </a>
        </div>
      </footer>
    </div>
  );
}