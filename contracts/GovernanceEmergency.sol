// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./BridgeLock.sol";

contract GovernanceEmergency is AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    BridgeLock public immutable bridgeLock;

    event EmergencyPauseExecuted(address indexed caller);

    constructor(address bridgeLockAddress, address admin) {
        require(bridgeLockAddress != address(0), "invalid bridge");
        require(admin != address(0), "invalid admin");

        bridgeLock = BridgeLock(bridgeLockAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, admin);
    }

    function pauseBridge() external onlyRole(RELAYER_ROLE) {
        bridgeLock.pause();
        emit EmergencyPauseExecuted(msg.sender);
    }
}
