// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {PolicyValidator} from "../src/PolicyValidator.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        PolicyValidator validator = new PolicyValidator();
        console.log("PolicyValidator deployed at:", address(validator));

        vm.stopBroadcast();
    }
}
