// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./WrappedVaultToken.sol";

contract BridgeMint is AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    WrappedVaultToken public immutable wrappedToken;

    uint256 public burnNonce;
    mapping(uint256 => bool) public processedMintNonces;

    event Minted(address indexed user, uint256 amount, uint256 nonce);
    event Burned(address indexed user, uint256 amount, uint256 nonce);

    constructor(address wrappedTokenAddress, address admin) {
        require(wrappedTokenAddress != address(0), "invalid token");
        require(admin != address(0), "invalid admin");

        wrappedToken = WrappedVaultToken(wrappedTokenAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, admin);
    }

    function mintWrapped(address user, uint256 amount, uint256 nonce) external onlyRole(RELAYER_ROLE) {
        require(user != address(0), "invalid user");
        require(amount > 0, "amount=0");
        require(!processedMintNonces[nonce], "mint nonce used");

        processedMintNonces[nonce] = true;
        wrappedToken.mint(user, amount);

        emit Minted(user, amount, nonce);
    }

    function burn(uint256 amount) external {
        require(amount > 0, "amount=0");

        uint256 nonce = burnNonce;
        burnNonce += 1;

        wrappedToken.burnFromBridge(msg.sender, amount);
        emit Burned(msg.sender, amount, nonce);
    }
}
