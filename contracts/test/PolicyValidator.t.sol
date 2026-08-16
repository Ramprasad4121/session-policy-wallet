// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {PolicyValidator} from "../src/PolicyValidator.sol";

contract PolicyValidatorTest is Test {
    PolicyValidator public validator;
    address public account = address(0xABCD);
    address public allowedTarget = address(0x1234);
    address public blockedTarget = address(0x9999);

    function setUp() public {
        validator = new PolicyValidator();

        // Simulate the account setting its own policy
        vm.prank(account);
        validator.setPolicy(0.05 ether); // 0.05 MON limit

        vm.prank(account);
        validator.setAllowedTarget(allowedTarget, true);
    }

    function test_AllowValidCall() public view {
        bool success = validator.validate(account, allowedTarget, 0.01 ether);
        assertTrue(success);
    }

    function test_RejectOverSpend() public view {
        bool success = validator.validate(account, allowedTarget, 0.06 ether);
        assertFalse(success);
    }

    function test_RejectBlockedTarget() public view {
        bool success = validator.validate(account, blockedTarget, 0.01 ether);
        assertFalse(success);
    }

    function test_RemainingSpend() public view {
        uint256 remaining = validator.getRemainingSpend(account);
        assertEq(remaining, 0.05 ether);
    }
}