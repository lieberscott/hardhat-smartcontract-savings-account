// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

error SavingsAccount__notOwner();
error SavingsAccount__notBackup();
error SavingsAccount__MainWithdrawalLimitTooSmall();
error SavingsAccount__BackupWithdrawalLimitTooSmall();
error SavingsAccount__MainWithdrawalTooBig();
error SavingsAccount__MainWithdrawalAlreadyMadeToday();
error SavingsAccount__CallFail();
error SavingsAccount__BackupWithdrawalTooBig();
error SavingsAccount__BackupWithdrawalAlreadyMadeToday();
error SavingsAccount__NotEnoughBalance();
error SavingsAccount__LargeWithdrawalNotAuthorized();
error SavingsAccount__AlreadySetTokenLimit();


/** @title A contract to add a backup user to protect funds
 * @author Scott Lieber
 * @notice This contract is to add a layer of protection to a user's funds
 * @dev No additional data
 */
contract SavingsAccount {

  uint24 public constant SECONDS_IN_DAY = 86400;

  struct TokenWithdrawalData {
    uint256 mainAccountWithdrawalLimit;
    uint256 backupAccountWithdrawalLimit;
    uint256 mainAccountLastWithdrawalDay;
    uint256 backupAccountLastWithdrawalDay;
  }

  address private immutable i_mainAccount;
  address private immutable i_backupAccount;
  uint256 private immutable i_mainAccountWithdrawalLimit;
  uint256 private immutable i_backupAccountWithdrawalLimit;
  mapping(address => TokenWithdrawalData) private s_tokenToWithdrawalData;
  uint256 private s_mainAccountLastWithdrawalDay = 0; // days since Jan. 1, 1970
  uint256 private s_backupAccountLastWithdrawalDay = 0;
  uint256 private s_backupAccountBigWithdrawalDay = 0;
  string private i_name = ""; // human-readable name

  modifier onlyMainAccount {
    if (msg.sender != i_mainAccount) { revert SavingsAccount__notOwner(); }
    _; // <- indicates to run the rest of the code; if _; was before the require statement, it would runn the code in the function first, then run the require statement after
  }

  modifier onlyBackupAccount {
    if (msg.sender != i_backupAccount) { revert SavingsAccount__notBackup(); }
    _; // <- indicates to run the rest of the code; if _; was before the require statement, it would runn the code in the function first, then run the require statement after
  }

  constructor(address _mainAccount, address _backupAccount, uint256 _mainAccountWithdrawalLimit, uint256 _backupAccountWithdrawalLimit, string memory _name) payable {
    if (_mainAccountWithdrawalLimit <= 0) {
      revert SavingsAccount__MainWithdrawalLimitTooSmall();
    }

    if (_backupAccountWithdrawalLimit <= 0) {
      revert SavingsAccount__BackupWithdrawalLimitTooSmall();
    }

    i_mainAccount = _mainAccount;
    i_backupAccount = _backupAccount;
    i_mainAccountWithdrawalLimit = _mainAccountWithdrawalLimit;
    i_backupAccountWithdrawalLimit = _backupAccountWithdrawalLimit;
    i_name = _name;
  }

  /**
   * @notice this function allows users to send ETH directly to this contract
   * it is called whenever someone simply sends eth to this contract without using a specific function call, or interacts with the contract without sending any data
   * @dev it does not use the "function" keyword because it is a special function name in Solidity that Solidity knows about (just like "constructor" is another special keyword, it does not take the word "function" prior to it because Solidity knows constructor is a special function)
   */
  receive() external payable {}

  /**
   * @notice allows users to withdraw up to their daily limit
   */
  function mainUserWithdrawal() public onlyMainAccount {

    // Solidity uses integer division, which is equivalent to floored division: 5 / 2 == 2
    // The requirement below should increment by 1 every day at 00:00 UTC (and should be the number of days since Jan. 1, 1970)
    // This way, the contract resets at a given time (00:00 UTC), rather than setting a new 24-hour wait after a withdrawal to make another withdrawal
    if (block.timestamp / SECONDS_IN_DAY == s_mainAccountLastWithdrawalDay) {
      revert SavingsAccount__MainWithdrawalAlreadyMadeToday();
    }

    s_mainAccountLastWithdrawalDay = block.timestamp / SECONDS_IN_DAY;

    // send amount to mainAccount
    (bool callSuccess,) = payable(i_mainAccount).call{value: address(this).balance < i_mainAccountWithdrawalLimit ? address(this).balance : i_mainAccountWithdrawalLimit}("");

    if (!callSuccess) {
      revert SavingsAccount__CallFail();
    }
  }

  /**
   * @notice allows the backup user to withdraw up to their daily limit
   */
  function backupUserWithdrawal() public onlyBackupAccount {

    if (block.timestamp / SECONDS_IN_DAY == s_backupAccountLastWithdrawalDay) {
      revert SavingsAccount__BackupWithdrawalAlreadyMadeToday();
    }

    s_backupAccountLastWithdrawalDay = block.timestamp / SECONDS_IN_DAY;
    
    // send amount to backupAccount
    (bool callSuccess,) = payable(i_backupAccount).call{value: address(this).balance < i_backupAccountWithdrawalLimit ? address(this).balance : i_backupAccountWithdrawalLimit}("");

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
   * @dev this function can be called an unlimited number of times by the mainUser, for the entire day, once the backupUser enables a large withdrawal that day
   */
  function mainAccountMakeBigWithdrawal(uint256 _withdrawalAmount, address _withdrawalAddress) public onlyMainAccount payable {
    if (_withdrawalAmount > address(this).balance) {
      revert SavingsAccount__NotEnoughBalance();
    }

    // require time to be within the same day as the withdrawal
    if (block.timestamp / SECONDS_IN_DAY != s_backupAccountBigWithdrawalDay) {
      revert SavingsAccount__LargeWithdrawalNotAuthorized();
    }


    (bool callSuccess,) = payable(_withdrawalAddress).call{value: _withdrawalAmount}("");
  }

  /**
   * @notice this function is called when the mainAccount user wants to transfer an ERC-20 token back to their main Account
   */
  function transferErcTokenMain(address _tokenAddress, uint256 _amount) public onlyMainAccount {
    if (_amount > s_tokenToWithdrawalData[_tokenAddress].mainAccountWithdrawalLimit) {
      revert SavingsAccount__MainWithdrawalTooBig();
    }
    if (block.timestamp / SECONDS_IN_DAY == s_tokenToWithdrawalData[_tokenAddress].mainAccountLastWithdrawalDay) {
      revert SavingsAccount__MainWithdrawalAlreadyMadeToday();
    }
    ERC20 erc20Token = ERC20(_tokenAddress);
    erc20Token.transfer(i_mainAccount, _amount);
    s_tokenToWithdrawalData[_tokenAddress].mainAccountLastWithdrawalDay = block.timestamp / SECONDS_IN_DAY;
  }

  /**
   * @notice this function is called when the backupAccount user wants to transfer an ERC-20 token back to their backup Account
   */
  function transferErcTokenBackup(address _tokenAddress, uint256 _amount) public onlyBackupAccount {
    ERC20 erc20Token = ERC20(_tokenAddress);
    if (_amount > s_tokenToWithdrawalData[_tokenAddress].backupAccountWithdrawalLimit) {
      revert SavingsAccount__BackupWithdrawalTooBig();
    }
    if (block.timestamp / SECONDS_IN_DAY == s_tokenToWithdrawalData[_tokenAddress].backupAccountLastWithdrawalDay) {
      revert SavingsAccount__BackupWithdrawalAlreadyMadeToday();
    }
    erc20Token.transfer(i_backupAccount, _amount);
    s_tokenToWithdrawalData[_tokenAddress].backupAccountLastWithdrawalDay = block.timestamp / SECONDS_IN_DAY;

  }

  /**
   * @notice this function is called when the backupAccount user wants to transfer an ERC-20 token back to their backup Account
   * @dev the mainAccount user can only call this function once
   */
  function setTokenLimits(address _tokenAddress, uint256 _mainAccountLimit, uint256 _backupAccountLimit) public onlyMainAccount {
    // This check restricts the mainAccount holder from setting the withdrawal limit for any given ERC-20 token once
    if (s_tokenToWithdrawalData[_tokenAddress].mainAccountWithdrawalLimit > 0 || s_tokenToWithdrawalData[_tokenAddress].backupAccountWithdrawalLimit > 0) {
      revert SavingsAccount__AlreadySetTokenLimit();
    }
    // these next two checks prevent the mainUser from setting a withdrawal limit of 0
    if (_mainAccountLimit <= 0) {
      revert SavingsAccount__MainWithdrawalLimitTooSmall();
    }
    if (_backupAccountLimit <= 0) {
      revert SavingsAccount__BackupWithdrawalLimitTooSmall();
    }

    s_tokenToWithdrawalData[_tokenAddress].mainAccountWithdrawalLimit = _mainAccountLimit;
    s_tokenToWithdrawalData[_tokenAddress].backupAccountWithdrawalLimit = _backupAccountLimit;
  }

  /**
   * @notice this function is called when the mainAccount user wants to make a big withdrawal, and can only be called after backupAccountEnableBigWithdrawal
   * @dev this function can be called an unlimited number of times by the mainUser, for the entire day, once the backupUser enables a large withdrawal that day
   */
  function mainAccountMakeBigTokenWithdrawal(address _tokenAddress, uint256 _withdrawalAmount, address _withdrawalAddress) public onlyMainAccount payable {

    // require time to be within the same day as the withdrawal
    if (block.timestamp / SECONDS_IN_DAY != s_backupAccountBigWithdrawalDay) {
      revert SavingsAccount__LargeWithdrawalNotAuthorized();
    }
    ERC20 erc20Token = ERC20(_tokenAddress);
    erc20Token.transfer(_withdrawalAddress, _withdrawalAmount);
  }

  function getEthBalance() public view returns (uint256) {
    return address(this).balance;
  }

  function getTokenBalance(address _tokenAddress) public view returns (uint256) {
    ERC20 erc20token = ERC20(_tokenAddress);
    return erc20token.balanceOf(address(this));
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

  function getTokenWithdrawalData(address _tokenAddress) public view returns (TokenWithdrawalData memory) {
    return s_tokenToWithdrawalData[_tokenAddress];
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

  function getName() public view returns (string memory) {
    return i_name;
  }

}