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

    function test_RevokeSession() public {
        vm.prank(owner);
        validator.revokeSession(sessionKey);

        bool active = validator.isSessionActive(owner, sessionKey);
        assertFalse(active);

        bool ok = validator.validateSession(owner, sessionKey, allowedTarget, 0.01 ether);
        assertFalse(ok);
    }
}
