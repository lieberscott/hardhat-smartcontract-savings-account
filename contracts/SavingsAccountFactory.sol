// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./SavingsAccount.sol";

error SavingsAccountFactory__AccountAlreadyExists();
error SavingsAccountFactory__SafekeeperAccountAlreadyExists();
error SavingsAccountFactory__OnlyOwner();


contract SavingsAccountFactory {

  address public immutable i_owner;

  // this struct is necessary in order to check if the mainAccount already has a savings account to prevent it from opening two
  struct SavingsAccountData {
    address contractAddress;
    bool exists;
  }

  mapping(address => SavingsAccountData) private mainAccountToContract; // mapping from mainAccount address => contract address
  mapping(address => SavingsAccountData) private safekeeperAccountToContract; // mapping from safekeeperAccount address => contract address


  event SavingsAccountCreated(address indexed mainAccount, address indexed safekeeperAccount, uint256 mainAccountWithdrawalLimit, uint256 safekeeperAccountWithdrawalLimit, string name);

  constructor () {
    i_owner = msg.sender;
  }

  function createSavingsAccount(address _mainAccount, address _safekeeperAccount, uint256 _mainAccountWithdrawalLimit, uint256 _safekeeperAccountWithdrawalLimit, string memory _name) payable public {
    if (mainAccountToContract[_mainAccount].exists) {
      revert SavingsAccountFactory__AccountAlreadyExists();
    }
    if (safekeeperAccountToContract[_safekeeperAccount].exists) {
      revert SavingsAccountFactory__SafekeeperAccountAlreadyExists();
    }
    
    // this is a way to extract the contract address from the returned value
    address _contractAddress = address((new SavingsAccount){value: msg.value}(_mainAccount, _safekeeperAccount, _mainAccountWithdrawalLimit, _safekeeperAccountWithdrawalLimit, _name));

    mainAccountToContract[_mainAccount].contractAddress = _contractAddress;
    mainAccountToContract[_mainAccount].exists = true;
    safekeeperAccountToContract[_safekeeperAccount].contractAddress = _contractAddress;
    safekeeperAccountToContract[_safekeeperAccount].exists = true;

    emit SavingsAccountCreated(_mainAccount, _safekeeperAccount, _mainAccountWithdrawalLimit, _safekeeperAccountWithdrawalLimit, _name);

  }

  function getContractFromMainAddress(address _mainAccount) public view returns(address) {
    // this should return the contract address for the given account
    return mainAccountToContract[_mainAccount].contractAddress;
  }

  function getContractFromSafekeeperAddress(address _safekeeperAccount) public view returns(address) {
    // this should return the contract address for the given account
    return safekeeperAccountToContract[_safekeeperAccount].contractAddress;
  }

  function kill() external {
    if (msg.sender != i_owner) {
      revert SavingsAccountFactory__OnlyOwner();
    }
    selfdestruct(payable(msg.sender));
  }

}