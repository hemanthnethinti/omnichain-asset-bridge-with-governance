// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract BridgeLock is AccessControl, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    IERC20 public immutable vaultToken;

    uint256 public lockNonce;
    mapping(uint256 => bool) public processedUnlockNonces;

    event Locked(address indexed user, uint256 amount, uint256 nonce);
    event Unlocked(address indexed user, uint256 amount, uint256 nonce);

    constructor(address token, address admin) {
        require(token != address(0), "invalid token");
        require(admin != address(0), "invalid admin");

        vaultToken = IERC20(token);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(RELAYER_ROLE, admin);
    }

    function lock(uint256 amount) external whenNotPaused {
        require(amount > 0, "amount=0");
        uint256 nonce = lockNonce;
        lockNonce += 1;

        vaultToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Locked(msg.sender, amount, nonce);
    }

    function unlock(address user, uint256 amount, uint256 nonce) external onlyRole(RELAYER_ROLE) whenNotPaused {
        require(user != address(0), "invalid user");
        require(amount > 0, "amount=0");
        require(!processedUnlockNonces[nonce], "unlock nonce used");

        processedUnlockNonces[nonce] = true;
        vaultToken.safeTransfer(user, amount);

        emit Unlocked(user, amount, nonce);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}
