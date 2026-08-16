// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @title PolicyValidator
 * @author Ramprasad
 * @notice Session Policy Wallet - Core policy engine
 * @dev Enforces spend limits and contract allowlists for session keys.
 *      Designed as a stepping stone toward full ERC-7579 validator integration.
 *
 * MVP Features:
 * - Native token spend limits per account/session
 * - Contract allowlist
 * - Session key registration
 * - Fail-closed validation
 */

contract PolicyValidator {
    // ============ Structs ============

    struct Policy {
        uint256 maxNativeSpend;   // Maximum native tokens allowed
        uint256 spent;            // Amount already spent
        bool enabled;
    }

    struct Session {
        address key;              // Session key address
        uint256 maxNativeSpend;
        uint256 spent;
        bool active;
        uint48 validUntil;        // Optional expiry (0 = no expiry)
    }

    // ============ Storage ============

    // account => Policy (legacy / owner-level policy)
    mapping(address => Policy) public policies;

    // account => target => allowed
    mapping(address => mapping(address => bool)) public allowedTargets;

    // account => sessionKey => Session
    mapping(address => mapping(address => Session)) public sessions;

    // account => list of session keys (for enumeration)
    mapping(address => address[]) private sessionKeys;

    // ============ Events ============

    event PolicySet(address indexed account, uint256 maxNativeSpend);
    event TargetAllowed(address indexed account, address indexed target, bool allowed);
    event SessionCreated(address indexed account, address indexed sessionKey, uint256 maxNativeSpend, uint48 validUntil);
    event SessionRevoked(address indexed account, address indexed sessionKey);
    event SpendRecorded(address indexed account, address indexed sessionKey, uint256 amount);

    // ============ Errors ============

    error PolicyNotEnabled();
    error SessionNotActive();
    error SessionExpired();
    error SpendLimitExceeded();
    error TargetNotAllowed();
    error ZeroAddress();
    error InvalidAmount();
    error SessionAlreadyExists();

    // ============ Owner Policy Management ============

    function setPolicy(uint256 maxNativeSpend) external {
        if (maxNativeSpend == 0) revert InvalidAmount();
        policies[msg.sender] = Policy({
            maxNativeSpend: maxNativeSpend,
            spent: 0,
            enabled: true
        });
        emit PolicySet(msg.sender, maxNativeSpend);
    }

    function setAllowedTarget(address target, bool allowed) external {
        if (target == address(0)) revert ZeroAddress();
        allowedTargets[msg.sender][target] = allowed;
        emit TargetAllowed(msg.sender, target, allowed);
    }

    function disablePolicy() external {
        policies[msg.sender].enabled = false;
    }

    // ============ Session Key Management ============

    /**
     * @notice Create a restricted session key
     * @param sessionKey The public address of the session key
     * @param maxNativeSpend Maximum this session can spend
     * @param validUntil Unix timestamp when session expires (0 = no expiry)
     */
    function createSession(
        address sessionKey,
        uint256 maxNativeSpend,
        uint48 validUntil
    ) external {
        if (sessionKey == address(0)) revert ZeroAddress();
        if (maxNativeSpend == 0) revert InvalidAmount();
        if (sessions[msg.sender][sessionKey].active) revert SessionAlreadyExists();

        sessions[msg.sender][sessionKey] = Session({
            key: sessionKey,
            maxNativeSpend: maxNativeSpend,
            spent: 0,
            active: true,
            validUntil: validUntil
        });

        sessionKeys[msg.sender].push(sessionKey);

        emit SessionCreated(msg.sender, sessionKey, maxNativeSpend, validUntil);
    }

    function revokeSession(address sessionKey) external {
        Session storage s = sessions[msg.sender][sessionKey];
        if (!s.active) revert SessionNotActive();
        s.active = false;
        emit SessionRevoked(msg.sender, sessionKey);
    }

    // ============ Core Validation ============

    /**
     * @notice Validate an action for an account (owner policy)
     */
    function validate(
        address account,
        address target,
        uint256 value
    ) external view returns (bool) {
        Policy memory policy = policies[account];
        if (!policy.enabled) return false;
        if (policy.spent + value > policy.maxNativeSpend) return false;
        if (!allowedTargets[account][target]) return false;
        return true;
    }

    /**
     * @notice Validate an action for a session key
     * @dev This is the main function agents should use
     */
    function validateSession(
        address account,
        address sessionKey,
        address target,
        uint256 value
    ) external view returns (bool) {
        Session memory s = sessions[account][sessionKey];

        if (!s.active) return false;
        if (s.validUntil != 0 && block.timestamp > s.validUntil) return false;
        if (s.spent + value > s.maxNativeSpend) return false;
        if (!allowedTargets[account][target]) return false;

        return true;
    }

    /**
     * @notice Record a successful spend against a session
     * @dev Should be called after a successful action
     */
    function recordSessionSpend(address account, address sessionKey, uint256 value) external {
        Session storage s = sessions[account][sessionKey];
        if (!s.active) revert SessionNotActive();
        if (s.spent + value > s.maxNativeSpend) revert SpendLimitExceeded();

        s.spent += value;
        emit SpendRecorded(account, sessionKey, value);
    }

    // ============ View Helpers ============

    function getRemainingSpend(address account) external view returns (uint256) {
        Policy memory p = policies[account];
        if (!p.enabled || p.spent >= p.maxNativeSpend) return 0;
        return p.maxNativeSpend - p.spent;
    }

    function getSessionRemainingSpend(address account, address sessionKey) external view returns (uint256) {
        Session memory s = sessions[account][sessionKey];
        if (!s.active || s.spent >= s.maxNativeSpend) return 0;
        return s.maxNativeSpend - s.spent;
    }

    function isTargetAllowed(address account, address target) external view returns (bool) {
        return allowedTargets[account][target];
    }

    function isSessionActive(address account, address sessionKey) external view returns (bool) {
        Session memory s = sessions[account][sessionKey];
        if (!s.active) return false;
        if (s.validUntil != 0 && block.timestamp > s.validUntil) return false;
        return true;
    }

    function getSessionKeys(address account) external view returns (address[] memory) {
        return sessionKeys[account];
    }
}
