// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {PolicyValidator} from "../src/PolicyValidator.sol";

contract PolicyValidatorTest is Test {
    PolicyValidator public validator;

    address public owner = address(0xABCD);
    address public sessionKey = address(0xBEEF);
    address public allowedTarget = address(0x1234);
    address public blockedTarget = address(0x9999);

    function setUp() public {
        validator = new PolicyValidator();

        vm.startPrank(owner);
        validator.setPolicy(1 ether);
        validator.setAllowedTarget(allowedTarget, true);
        validator.createSession(sessionKey, 0.1 ether, 0); // no expiry
        vm.stopPrank();
    }

    function test_OwnerValidate_Allowed() public view {
        bool ok = validator.validate(owner, allowedTarget, 0.5 ether);
        assertTrue(ok);
    }

    function test_OwnerValidate_OverSpend() public view {
        bool ok = validator.validate(owner, allowedTarget, 2 ether);
        assertFalse(ok);
    }

    function test_OwnerValidate_BlockedTarget() public view {
        bool ok = validator.validate(owner, blockedTarget, 0.1 ether);
        assertFalse(ok);
    }

    function test_SessionValidate_Allowed() public view {
        bool ok = validator.validateSession(owner, sessionKey, allowedTarget, 0.05 ether);
        assertTrue(ok);
    }

    function test_SessionValidate_OverSpend() public view {
        bool ok = validator.validateSession(owner, sessionKey, allowedTarget, 0.2 ether);
        assertFalse(ok);
    }

    function test_SessionValidate_BlockedTarget() public view {
        bool ok = validator.validateSession(owner, sessionKey, blockedTarget, 0.01 ether);
        assertFalse(ok);
    }

    function test_RecordSessionSpend() public {
        vm.prank(owner);
        validator.recordSessionSpend(owner, sessionKey, 0.03 ether);

        uint256 remaining = validator.getSessionRemainingSpend(owner, sessionKey);
        assertEq(remaining, 0.07 ether);
    }

    // ---- Step 1: comprehensive recordSessionSpend coverage ----

    function test_RecordSpend_CumulativeDecrease() public {
        // Record two separate spends and verify the balance reflects both
        validator.recordSessionSpend(owner, sessionKey, 0.02 ether);
        assertEq(validator.getSessionRemainingSpend(owner, sessionKey), 0.08 ether);

        validator.recordSessionSpend(owner, sessionKey, 0.03 ether);
        assertEq(validator.getSessionRemainingSpend(owner, sessionKey), 0.05 ether);
    }

    function test_RecordSpend_ExceedingRemainingReverts() public {
        // Spend most of the limit first
        validator.recordSessionSpend(owner, sessionKey, 0.08 ether);
        assertEq(validator.getSessionRemainingSpend(owner, sessionKey), 0.02 ether);

        // Now try to spend more than the remaining 0.02 — must revert
        vm.expectRevert(PolicyValidator.SpendLimitExceeded.selector);
        validator.recordSessionSpend(owner, sessionKey, 0.03 ether);
    }

    function test_RecordSpend_ValidationReflectsRecordedSpend() public {
        // Before recording: 0.09 should be valid (limit is 0.1)
        assertTrue(validator.validateSession(owner, sessionKey, allowedTarget, 0.09 ether));

        // Record 0.05 spend
        validator.recordSessionSpend(owner, sessionKey, 0.05 ether);

        // After recording: remaining is 0.05, so 0.09 must now fail
        assertFalse(validator.validateSession(owner, sessionKey, allowedTarget, 0.09 ether));

        // But 0.04 should still pass
        assertTrue(validator.validateSession(owner, sessionKey, allowedTarget, 0.04 ether));
    }

    function test_RecordSpend_ExactLimitExhaustion() public {
        // Spend the full limit in one shot
        validator.recordSessionSpend(owner, sessionKey, 0.1 ether);
        assertEq(validator.getSessionRemainingSpend(owner, sessionKey), 0);

        // Any further spend — even zero-value actions that push over — must revert
        vm.expectRevert(PolicyValidator.SpendLimitExceeded.selector);
        validator.recordSessionSpend(owner, sessionKey, 1);

        // Validation for any non-zero value must also fail
        assertFalse(validator.validateSession(owner, sessionKey, allowedTarget, 1));
    }

    function test_RecordSpend_InactiveSessionReverts() public {
        // Revoke the session first
        vm.prank(owner);
        validator.revokeSession(sessionKey);

        // Recording spend on a revoked session must revert
        vm.expectRevert(PolicyValidator.SessionNotActive.selector);
        validator.recordSessionSpend(owner, sessionKey, 0.01 ether);
    }

    function test_RevokeSession() public {
        vm.prank(owner);
        validator.revokeSession(sessionKey);

        bool active = validator.isSessionActive(owner, sessionKey);
        assertFalse(active);

        bool ok = validator.validateSession(owner, sessionKey, allowedTarget, 0.01 ether);
        assertFalse(ok);
    }
}
