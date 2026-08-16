// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @title PolicyValidator
 * @author Ramprasad
 * @notice Minimal Session Policy Validator for Monad Blitz
 * @dev Enforces:
 *      1. Native MON spend limit
 *      2. Target contract allowlist
 *      Fail-closed by design.
 */
contract PolicyValidator {

    // ============ Structs ============

    struct Policy {
        uint256 maxNativeSpend;
        uint256 spent;
        bool enabled;
    }

    // ============ Storage ============

    mapping(address account => Policy) public policies;
    mapping(address account => mapping(address target => bool)) public allowedTargets;

    // ============ Events ============

    event PolicySet(address indexed account, uint256 maxNativeSpend);
    event TargetAllowed(address indexed account, address indexed target, bool allowed);
    event PolicyDisabled(address indexed account);

    // ============ Errors ============

    error PolicyNotEnabled();
    error SpendLimitExceeded();
    error TargetNotAllowed();
    error ZeroAddress();

    // ============ Policy Management ============

    function setPolicy(uint256 maxNativeSpend) external {
        require(maxNativeSpend > 0, "maxNativeSpend must be > 0");
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
        emit PolicyDisabled(msg.sender);
    }

    // ============ Core Validation ============

    /**
     * @notice Validates whether an account is allowed to perform a call
     * @param account The smart account / session owner
     * @param target  The contract being called
     * @param value   Native MON value being sent
     * @return success True if allowed, false if rejected
     */
    function validate(
        address account,
        address target,
        uint256 value
    ) external view returns (bool success) {
        Policy memory policy = policies[account];

        if (!policy.enabled) return false;

        // Spend limit check
        if (policy.spent + value > policy.maxNativeSpend) {
            return false;
        }

        // Allowlist check
        if (!allowedTargets[account][target]) {
            return false;
        }

        return true;
    }

    /**
     * @notice Records a successful spend (should be called after execution)
     */
    function recordSpend(address account, uint256 value) external {
        Policy storage policy = policies[account];
        require(policy.enabled, "Policy not enabled");
        policy.spent += value;
    }

    // ============ View Helpers ============

    function getRemainingSpend(address account) external view returns (uint256) {
        Policy memory policy = policies[account];
        if (!policy.enabled || policy.spent >= policy.maxNativeSpend) {
            return 0;
        }
        return policy.maxNativeSpend - policy.spent;
    }

    function isTargetAllowed(address account, address target) external view returns (bool) {
        return allowedTargets[account][target];
    }

    function isPolicyEnabled(address account) external view returns (bool) {
        return policies[account].enabled;
    }
}