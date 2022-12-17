// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

error SavingsAccount__notOwner();
error SavingsAccount__notBackup();
error SavingsAccount__MainWithdrawalLimitTooSmall();
error SavingsAccount__BackupWithdrawalLimitTooSmall();
error SavingsAccount__MainWithdrawalTooBig();
error SavingsAccount__MainWithdrawalAlreadyMadeToday();
error SavingsAccount__CallFail();
error SavingsAccount__BackupWithdrawalTooBig();
error SavingsAccount__BackupWithdrawalAlreadyMadeToday();
error SavingsAccount__NotEnoughEth();
error SavingsAccount__LargeWithdrawalNotAuthorized();


/** @title A contract to add a backup user to protect funds
 * @author Scott Lieber
 * @notice This contract is to add a layer of protection to a user's funds
 * @dev No additional data
 */
contract SavingsAccount {

  uint24 public constant SECONDS_IN_DAY = 86400;

  address private immutable i_mainAccount;
  address private immutable i_backupAccount;
  uint256 private immutable i_mainAccountWithdrawalLimit;
  uint256 private immutable i_backupAccountWithdrawalLimit;
  uint256 private s_mainAccountLastWithdrawalDay = 0; // time in seconds since Jan. 1, 1970
  uint256 private s_backupAccountLastWithdrawalDay = 0;
  uint256 private s_backupAccountBigWithdrawalDay = 0;

  modifier onlyMainAccount {
    if (msg.sender != i_mainAccount) { revert SavingsAccount__notOwner(); }
    _; // <- indicates to run the rest of the code; if _; was before the require statement, it would runn the code in the function first, then run the require statement after
  }

  modifier onlyBackupAccount {
    if (msg.sender != i_backupAccount) { revert SavingsAccount__notBackup(); }
    _; // <- indicates to run the rest of the code; if _; was before the require statement, it would runn the code in the function first, then run the require statement after
  }


  constructor(address _mainAccount, address _backupAccount, uint256 _mainAccountWithdrawalLimit, uint256 _backupAccountWithdrawalLimit) payable {
    if (_mainAccountWithdrawalLimit <= 0) {
      revert SavingsAccount__MainWithdrawalLimitTooSmall();
    }

    if (_backupAccountWithdrawalLimit <= 0) {
      revert SavingsAccount__BackupWithdrawalLimitTooSmall();
    }

    // msg.sender MAY BE THE FACTORY CONTRACT, NEED TO CHECK THIS
    i_mainAccount = _mainAccount;
    i_backupAccount = _backupAccount;
    i_mainAccountWithdrawalLimit = _mainAccountWithdrawalLimit;
    i_backupAccountWithdrawalLimit = _backupAccountWithdrawalLimit;
  }

  /**
   * @notice this function allows users to send ETH directly to this contract
   * it is called whenever someone simply sends eth to this contract without using a specific function call, or interacts with the contract without sending any data
   * @dev it does not use the "function" keyword because it is a special function name in Solidity that Solidity knows about (just like "constructor" is another special keyword, it does not take the word "function" prior to it because Solidity knows constructor is a special function)
   */
  receive() external payable {}

  /**
   * @notice allows users to withdraw up to their daily limit
   * @param _withdrawalAmount how much the mainUser wishes to withdraw that day
   */
  function mainUserWithdrawal(uint256 _withdrawalAmount) public onlyMainAccount {
    if (_withdrawalAmount >= i_mainAccountWithdrawalLimit) {
      revert SavingsAccount__MainWithdrawalTooBig();
    }

    // Solidity uses integer division, which is equivalent to floored division: 5 / 2 == 2
    // The requirement below should increment by 1 every day at 00:00 UTC (and should be the number of days since Jan. 1, 1970)
    // This way, the contract resets at a given time (00:00 UTC), rather than setting a new 24-hour wait after a withdrawal to make another withdrawal
    // CHECK IF THIS IS RIGHT
    // MAKE SURE THE TYPES ALL WORK RIGHT TOGETHER (SECONDS_IN_DAY is a uint24, mainAccountLastWithdrawalDay is a uint256, etc.)
    if (block.timestamp / SECONDS_IN_DAY <= s_mainAccountLastWithdrawalDay) {
      revert SavingsAccount__MainWithdrawalAlreadyMadeToday();
    }

    s_mainAccountLastWithdrawalDay = block.timestamp / SECONDS_IN_DAY;

    // send amount to mainAccount
    // (bool callSuccess,) = payable(msg.sender).call{value: address(this).balance}("");
    (bool callSuccess,) = payable(i_mainAccount).call{value: _withdrawalAmount}("");

    if (!callSuccess) {
      revert SavingsAccount__CallFail();
    }
  }

  /**
   * @notice allows the backup user to withdraw up to their daily limit
   * @param _withdrawalAmount how much the backupUser wishes to withdraw that day
   */
  function backupUserWithdrawal(uint256 _withdrawalAmount) public onlyBackupAccount {
    if (_withdrawalAmount >= i_backupAccountWithdrawalLimit) {
      revert SavingsAccount__BackupWithdrawalTooBig();
    }

    if (block.timestamp / SECONDS_IN_DAY <= s_backupAccountLastWithdrawalDay) {
      revert SavingsAccount__BackupWithdrawalAlreadyMadeToday();
    }

    s_backupAccountLastWithdrawalDay = block.timestamp / SECONDS_IN_DAY;
    
    // send amount to backupAccount
    (bool callSuccess,) = payable(i_backupAccount).call{value: _withdrawalAmount}("");

    if (!callSuccess) {
      revert SavingsAccount__CallFail();
    }
  }

  /**
   * @notice this function is called when the backupAccount user wants to authorize the mainAccount user to make a withdrawal larger than their daily limit
   */
  function backupAccountEnableBigWithdrawal() public onlyBackupAccount {
    s_backupAccountBigWithdrawalDay = block.timestamp / SECONDS_IN_DAY;
  }

  /**
   * @notice this function is called when the mainAccount user wants to make a big withdrawal, and can only be called after backupAccountEnableBigWithdrawal
   */
  function mainAccountMakeBigWithdrawal(uint256 _withdrawalAmount, address _withdrawalAddress) public onlyMainAccount payable {
    if (_withdrawalAmount > address(this).balance) {
      revert SavingsAccount__NotEnoughEth();
    }

    // require time to be within the same day as the withdrawal
    if (block.timestamp / SECONDS_IN_DAY != s_backupAccountBigWithdrawalDay) {
      revert SavingsAccount__LargeWithdrawalNotAuthorized();
    }


    (bool callSuccess,) = payable(_withdrawalAddress).call{value: _withdrawalAmount}("");
  }


  function getMainAccount() public view returns (address) {
    return i_mainAccount;
  }

  function getBackupAccount() public view returns (address) {
    return i_backupAccount;
  }

  function getMainAccountWithdrawalLimit() public view returns (uint256) {
    return i_mainAccountWithdrawalLimit;
  }

  function getBackupAccountWithdrawalLimit() public view returns (uint256) {
    return i_backupAccountWithdrawalLimit;
  }

  function getMainAccountLastWithdrawalDay() public view returns (uint256) {
    return s_mainAccountLastWithdrawalDay;
  }

  function getBackupAccountLastWithdrawalDay() public view returns (uint256) {
    return s_backupAccountLastWithdrawalDay;
  }

  function getBackupAccountBigWithdrawalDay() public view returns (uint256) {
    return s_backupAccountBigWithdrawalDay;
  }

}