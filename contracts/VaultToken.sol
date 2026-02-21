// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract VaultToken is ERC20 {
    constructor() ERC20("Vault Token", "VAULT") {
        _mint(msg.sender, 1_000_000 ether);
    }
}
