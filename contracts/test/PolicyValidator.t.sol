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

        // Now try to spend more than the remaining 0.02 — must revert with context
        vm.expectRevert(
            abi.encodeWithSelector(
                PolicyValidator.SpendLimitExceeded.selector,
                owner, sessionKey, 0.03 ether, 0.02 ether
            )
        );
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

        // Any further spend — even 1 wei — must revert with context
        vm.expectRevert(
            abi.encodeWithSelector(
                PolicyValidator.SpendLimitExceeded.selector,
                owner, sessionKey, uint256(1), uint256(0)
            )
        );
        validator.recordSessionSpend(owner, sessionKey, 1);

        // Validation for any non-zero value must also fail
        assertFalse(validator.validateSession(owner, sessionKey, allowedTarget, 1));
    }

    function test_RecordSpend_InactiveSessionReverts() public {
        // Revoke the session first
        vm.prank(owner);
        validator.revokeSession(sessionKey);

        // Recording spend on a revoked session must revert with context
        vm.expectRevert(
            abi.encodeWithSelector(
                PolicyValidator.SessionNotActive.selector,
                owner, sessionKey
            )
        );
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

    // ---- Step 2: session expiry coverage ----

    function test_SessionExpiry_ValidBeforeExpiry() public {
        // Create a session that expires at timestamp 2000
        address expiringKey = address(0xEEEE);
        vm.prank(owner);
        validator.createSession(expiringKey, 0.1 ether, 2000);

        // Warp to timestamp 1999 — session should still be valid
        vm.warp(1999);
        assertTrue(validator.validateSession(owner, expiringKey, allowedTarget, 0.01 ether));
        assertTrue(validator.isSessionActive(owner, expiringKey));
    }

    function test_SessionExpiry_RejectedAfterExpiry() public {
        // Create a session that expires at timestamp 2000
        address expiringKey = address(0xEEEE);
        vm.prank(owner);
        validator.createSession(expiringKey, 0.1 ether, 2000);

        // Warp to timestamp 2001 — session must be rejected
        vm.warp(2001);
        assertFalse(validator.validateSession(owner, expiringKey, allowedTarget, 0.01 ether));
        assertFalse(validator.isSessionActive(owner, expiringKey));
    }

    function test_SessionExpiry_ExactBoundary() public {
        // Create a session that expires at timestamp 2000
        address expiringKey = address(0xEEEE);
        vm.prank(owner);
        validator.createSession(expiringKey, 0.1 ether, 2000);

        // At exactly validUntil (2000), block.timestamp == validUntil, NOT greater
        // The check is `block.timestamp > s.validUntil`, so timestamp == validUntil is still valid
        vm.warp(2000);
        assertTrue(validator.validateSession(owner, expiringKey, allowedTarget, 0.01 ether));

        // One second later, it expires
        vm.warp(2001);
        assertFalse(validator.validateSession(owner, expiringKey, allowedTarget, 0.01 ether));
    }

    function test_SessionExpiry_NoExpiryUnaffected() public {
        // The default sessionKey from setUp has validUntil = 0 (no expiry)
        // Even at a very far future timestamp, it should still work
        vm.warp(999_999_999);
        assertTrue(validator.validateSession(owner, sessionKey, allowedTarget, 0.01 ether));
        assertTrue(validator.isSessionActive(owner, sessionKey));
    }

    function test_SessionExpiry_RecordSpendStillWorksBeforeExpiry() public {
        address expiringKey = address(0xEEEE);
        vm.prank(owner);
        validator.createSession(expiringKey, 0.1 ether, 2000);

        // Before expiry: recording spend should work
        vm.warp(1500);
        validator.recordSessionSpend(owner, expiringKey, 0.03 ether);
        assertEq(validator.getSessionRemainingSpend(owner, expiringKey), 0.07 ether);
    }

    // ---- Step 3: errors, events, and validateSessionStrict ----

    function test_ValidateStrict_RevertsSessionNotActive() public {
        address unknownKey = address(0xDEAD);
        vm.expectRevert(
            abi.encodeWithSelector(
                PolicyValidator.SessionNotActive.selector,
                owner, unknownKey
            )
        );
        validator.validateSessionStrict(owner, unknownKey, allowedTarget, 0.01 ether);
    }

    function test_ValidateStrict_RevertsSessionExpired() public {
        address expiringKey = address(0xEEEE);
        vm.prank(owner);
        validator.createSession(expiringKey, 0.1 ether, 2000);

        vm.warp(2001);
        vm.expectRevert(
            abi.encodeWithSelector(
                PolicyValidator.SessionExpired.selector,
                owner, expiringKey, uint48(2000), uint256(2001)
            )
        );
        validator.validateSessionStrict(owner, expiringKey, allowedTarget, 0.01 ether);
    }

    function test_ValidateStrict_RevertsSpendLimitExceeded() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                PolicyValidator.SpendLimitExceeded.selector,
                owner, sessionKey, 0.2 ether, 0.1 ether
            )
        );
        validator.validateSessionStrict(owner, sessionKey, allowedTarget, 0.2 ether);
    }

    function test_ValidateStrict_RevertsTargetNotAllowed() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                PolicyValidator.TargetNotAllowed.selector,
                owner, blockedTarget
            )
        );
        validator.validateSessionStrict(owner, sessionKey, blockedTarget, 0.01 ether);
    }

    function test_ValidateStrict_PassesOnValidAction() public view {
        // Should not revert
        validator.validateSessionStrict(owner, sessionKey, allowedTarget, 0.05 ether);
    }

    function test_Event_SpendRecordedIncludesRemaining() public {
        // SpendRecorded now includes remainingSpend as the 4th field
        vm.expectEmit(true, true, false, true);
        emit PolicyValidator.SpendRecorded(owner, sessionKey, 0.03 ether, 0.07 ether);
        validator.recordSessionSpend(owner, sessionKey, 0.03 ether);
    }

    function test_Event_PolicyDisabled() public {
        vm.expectEmit(true, false, false, true);
        emit PolicyValidator.PolicyDisabled(owner);
        vm.prank(owner);
        validator.disablePolicy();
    }

    function test_Event_SessionCreatedFields() public {
        address newKey = address(0xAAAA);
        vm.expectEmit(true, true, false, true);
        emit PolicyValidator.SessionCreated(owner, newKey, 0.5 ether, 3000);
        vm.prank(owner);
        validator.createSession(newKey, 0.5 ether, 3000);
    }

    function test_Event_SessionRevokedFields() public {
        vm.expectEmit(true, true, false, true);
        emit PolicyValidator.SessionRevoked(owner, sessionKey);
        vm.prank(owner);
        validator.revokeSession(sessionKey);
    }

    function test_RecordSpend_RevertsOnExpiredSession() public {
        address expiringKey = address(0xEEEE);
        vm.prank(owner);
        validator.createSession(expiringKey, 0.1 ether, 2000);

        // Warp past expiry
        vm.warp(2001);
        vm.expectRevert(
            abi.encodeWithSelector(
                PolicyValidator.SessionExpired.selector,
                owner, expiringKey, uint48(2000), uint256(2001)
            )
        );
        validator.recordSessionSpend(owner, expiringKey, 0.01 ether);
    }

    function test_CreateSession_RevertsSessionAlreadyExists() public {
        // sessionKey was already created in setUp — creating again must revert
        vm.expectRevert(
            abi.encodeWithSelector(
                PolicyValidator.SessionAlreadyExists.selector,
                owner, sessionKey
            )
        );
        vm.prank(owner);
        validator.createSession(sessionKey, 0.05 ether, 0);
    }
}
