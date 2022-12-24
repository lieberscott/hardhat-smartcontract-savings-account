// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./SavingsAccount.sol";

error SavingsAccountFactory__AccountAlreadyExists();
error SavingsAccountFactory__BackupAccountAlreadyExists();


contract SavingsAccountFactory {

  address public immutable i_owner;

  // this struct is necessary in order to check if the mainAccount already has a savings account to prevent it from opening two
  struct SavingsAccountData {
    address contractAddress;
    bool exists;
  }

  mapping(address => SavingsAccountData) private mainAccountToContract; // mapping from mainAccount address => contract address
  mapping(address => SavingsAccountData) private backupAccountToContract; // mapping from backupAccount address => contract address


  event SavingsAccountCreated(address indexed mainAccount, address indexed backupAccount, uint256 mainAccountWithdrawalLimit, uint256 backupAccountWithdrawalLimit);

  constructor () {
    i_owner = msg.sender;
  }

  function createSavingsAccount(address _mainAccount, address _backupAccount, uint256 _mainAccountWithdrawalLimit, uint256 _backupAccountWithdrawalLimit) payable public {
    if (mainAccountToContract[_mainAccount].exists) {
      revert SavingsAccountFactory__AccountAlreadyExists();
    }
    if (backupAccountToContract[_backupAccount].exists) {
      revert SavingsAccountFactory__BackupAccountAlreadyExists();
    }
    
    // this is a way to extract the contract address from the returned value
    address _contractAddress = address((new SavingsAccount){value: msg.value}(_mainAccount, _backupAccount, _mainAccountWithdrawalLimit, _backupAccountWithdrawalLimit));

    mainAccountToContract[_mainAccount].contractAddress = _contractAddress;
    mainAccountToContract[_mainAccount].exists = true;
    backupAccountToContract[_backupAccount].contractAddress = _contractAddress;
    backupAccountToContract[_backupAccount].exists = true;

    emit SavingsAccountCreated(_mainAccount, _backupAccount, _mainAccountWithdrawalLimit, _backupAccountWithdrawalLimit);

  }

  function getContractFromMainAddress(address _mainAccount) public view returns(address) {
    // this should return the contract address for the given account
    return mainAccountToContract[_mainAccount].contractAddress;
  }

  function getContractFromBackupAddress(address _backupAccount) public view returns(address) {
    // this should return the contract address for the given account
    return backupAccountToContract[_backupAccount].contractAddress;
  }

}