// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MyToken is ERC20 {

  // For testing purposes only
  
  constructor(address account1, address account2, uint256 initialSupply) ERC20("MyToken", "MYT") {
    _mint(account1, initialSupply);
    _mint(account2, initialSupply);
  }

}