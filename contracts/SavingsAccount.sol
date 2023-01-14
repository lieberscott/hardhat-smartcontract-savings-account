// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

error SavingsAccount__notOwner();
error SavingsAccount__notSafekeeper();
error SavingsAccount__MainWithdrawalLimitTooSmall();
error SavingsAccount__SafekeeperWithdrawalLimitTooSmall();
error SavingsAccount__MainWithdrawalAlreadyMadeToday();
error SavingsAccount__CallFail();
error SavingsAccount__SafekeeperWithdrawalAlreadyMadeToday();
error SavingsAccount__NotEnoughBalance();
error SavingsAccount__LargeWithdrawalNotAuthorized();
error SavingsAccount__AlreadySetTokenLimit();


/** @title A contract to add a safekeeper user to protect funds
 * @author Scott Lieber
 * @notice This contract is to add a layer of protection to a user's funds
 * @dev No additional data
 */
contract SavingsAccount {

  uint24 public constant SECONDS_IN_DAY = 86400;

  struct TokenWithdrawalData {
    uint256 mainAccountWithdrawalLimit;
    uint256 safekeeperAccountWithdrawalLimit;
    uint256 mainAccountLastWithdrawalDay;
    uint256 safekeeperAccountLastWithdrawalDay;
  }

  address private immutable i_mainAccount;
  address private immutable i_safekeeperAccount;
  uint256 private immutable i_mainAccountWithdrawalLimit;
  uint256 private immutable i_safekeeperAccountWithdrawalLimit;
  mapping(address => TokenWithdrawalData) private s_tokenToWithdrawalData;
  uint256 private s_mainAccountLastWithdrawalDay = 0; // days since Jan. 1, 1970
  uint256 private s_safekeeperAccountLastWithdrawalDay = 0;
  uint256 private s_safekeeperAccountBigWithdrawalDay = 0;
  string private i_name = ""; // human-readable name

  modifier onlyMainAccount {
    if (msg.sender != i_mainAccount) { revert SavingsAccount__notOwner(); }
    _; // <- indicates to run the rest of the code; if _; was before the require statement, it would runn the code in the function first, then run the require statement after
  }

  modifier onlySafekeeperAccount {
    if (msg.sender != i_safekeeperAccount) { revert SavingsAccount__notSafekeeper(); }
    _; // <- indicates to run the rest of the code; if _; was before the require statement, it would runn the code in the function first, then run the require statement after
  }

  constructor(address _mainAccount, address _safekeeperAccount, uint256 _mainAccountWithdrawalLimit, uint256 _safekeeperAccountWithdrawalLimit, string memory _name) payable {
    if (_mainAccountWithdrawalLimit <= 0) {
      revert SavingsAccount__MainWithdrawalLimitTooSmall();
    }

    if (_safekeeperAccountWithdrawalLimit <= 0) {
      revert SavingsAccount__SafekeeperWithdrawalLimitTooSmall();
    }

    i_mainAccount = _mainAccount;
    i_safekeeperAccount = _safekeeperAccount;
    i_mainAccountWithdrawalLimit = _mainAccountWithdrawalLimit;
    i_safekeeperAccountWithdrawalLimit = _safekeeperAccountWithdrawalLimit;
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
   * @notice allows the safekeeper user to withdraw up to their daily limit
   */
  function safekeeperUserWithdrawal() public onlySafekeeperAccount {

    if (block.timestamp / SECONDS_IN_DAY == s_safekeeperAccountLastWithdrawalDay) {
      revert SavingsAccount__SafekeeperWithdrawalAlreadyMadeToday();
    }

    s_safekeeperAccountLastWithdrawalDay = block.timestamp / SECONDS_IN_DAY;
    
    // send amount to safekeeperAccount
    (bool callSuccess,) = payable(i_safekeeperAccount).call{value: address(this).balance < i_safekeeperAccountWithdrawalLimit ? address(this).balance : i_safekeeperAccountWithdrawalLimit}("");

    if (!callSuccess) {
      revert SavingsAccount__CallFail();
    }
  }

  /**
   * @notice this function is called when the safekeeperAccount user wants to authorize the mainAccount user to make a withdrawal larger than their daily limit
   */
  function safekeeperAccountEnableBigWithdrawal() public onlySafekeeperAccount {
    s_safekeeperAccountBigWithdrawalDay = block.timestamp / SECONDS_IN_DAY;
  }

  /**
   * @notice this function is called when the mainAccount user wants to make a big withdrawal, and can only be called after safekeeperAccountEnableBigWithdrawal
   * @dev this function can be called an unlimited number of times by the mainUser, for the entire day, once the safekeeperUser enables a large withdrawal that day
   */
  function mainAccountMakeBigWithdrawal(uint256 _withdrawalAmount, address _withdrawalAddress) public onlyMainAccount payable {
    if (_withdrawalAmount > address(this).balance) {
      revert SavingsAccount__NotEnoughBalance();
    }

    // require time to be within the same day as the withdrawal
    if (block.timestamp / SECONDS_IN_DAY != s_safekeeperAccountBigWithdrawalDay) {
      revert SavingsAccount__LargeWithdrawalNotAuthorized();
    }


    (bool callSuccess,) = payable(_withdrawalAddress).call{value: _withdrawalAmount}("");
  }

  /**
   * @notice this function is called when the mainAccount user wants to transfer an ERC-20 token back to their main Account
   */
  function transferErcTokenMain(address _tokenAddress) public onlyMainAccount {
    if (block.timestamp / SECONDS_IN_DAY == s_tokenToWithdrawalData[_tokenAddress].mainAccountLastWithdrawalDay) {
      revert SavingsAccount__MainWithdrawalAlreadyMadeToday();
    }
    ERC20 erc20Token = ERC20(_tokenAddress);
    erc20Token.transfer(i_mainAccount, s_tokenToWithdrawalData[_tokenAddress].mainAccountWithdrawalLimit);
    s_tokenToWithdrawalData[_tokenAddress].mainAccountLastWithdrawalDay = block.timestamp / SECONDS_IN_DAY;
  }

  /**
   * @notice this function is called when the safekeeperAccount user wants to transfer an ERC-20 token back to their safekeeper Account
   */
  function transferErcTokenSafekeeper(address _tokenAddress) public onlySafekeeperAccount {
    if (block.timestamp / SECONDS_IN_DAY == s_tokenToWithdrawalData[_tokenAddress].safekeeperAccountLastWithdrawalDay) {
      revert SavingsAccount__SafekeeperWithdrawalAlreadyMadeToday();
    }
    ERC20 erc20Token = ERC20(_tokenAddress);
    erc20Token.transfer(i_safekeeperAccount, s_tokenToWithdrawalData[_tokenAddress].safekeeperAccountWithdrawalLimit);
    s_tokenToWithdrawalData[_tokenAddress].safekeeperAccountLastWithdrawalDay = block.timestamp / SECONDS_IN_DAY;

  }

  /**
   * @notice this function is called when the safekeeperAccount user wants to transfer an ERC-20 token back to their safekeeper Account
   * @dev the mainAccount user can only call this function once
   */
  function setTokenLimits(address _tokenAddress, uint256 _mainAccountLimit, uint256 _safekeeperAccountLimit) public onlyMainAccount {
    // This check restricts the mainAccount holder from setting the withdrawal limit for any given ERC-20 token once
    if (s_tokenToWithdrawalData[_tokenAddress].mainAccountWithdrawalLimit > 0 || s_tokenToWithdrawalData[_tokenAddress].safekeeperAccountWithdrawalLimit > 0) {
      revert SavingsAccount__AlreadySetTokenLimit();
    }
    // these next two checks prevent the mainUser from setting a withdrawal limit of 0
    if (_mainAccountLimit <= 0) {
      revert SavingsAccount__MainWithdrawalLimitTooSmall();
    }
    if (_safekeeperAccountLimit <= 0) {
      revert SavingsAccount__SafekeeperWithdrawalLimitTooSmall();
    }

    s_tokenToWithdrawalData[_tokenAddress].mainAccountWithdrawalLimit = _mainAccountLimit;
    s_tokenToWithdrawalData[_tokenAddress].safekeeperAccountWithdrawalLimit = _safekeeperAccountLimit;
  }

  /**
   * @notice this function is called when the mainAccount user wants to make a big withdrawal, and can only be called after safekeeperAccountEnableBigWithdrawal
   * @dev this function can be called an unlimited number of times by the mainUser, for the entire day, once the safekeeperUser enables a large withdrawal that day
   */
  function mainAccountMakeBigTokenWithdrawal(address _tokenAddress, uint256 _withdrawalAmount, address _withdrawalAddress) public onlyMainAccount payable {

    // require time to be within the same day as the withdrawal
    if (block.timestamp / SECONDS_IN_DAY != s_safekeeperAccountBigWithdrawalDay) {
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

  function getSafekeeperAccount() public view returns (address) {
    return i_safekeeperAccount;
  }

  function getMainAccountWithdrawalLimit() public view returns (uint256) {
    return i_mainAccountWithdrawalLimit;
  }

  function getSafekeeperAccountWithdrawalLimit() public view returns (uint256) {
    return i_safekeeperAccountWithdrawalLimit;
  }

  function getTokenWithdrawalData(address _tokenAddress) public view returns (TokenWithdrawalData memory) {
    return s_tokenToWithdrawalData[_tokenAddress];
  }

  function getMainAccountLastWithdrawalDay() public view returns (uint256) {
    return s_mainAccountLastWithdrawalDay;
  }

  function getSafekeeperAccountLastWithdrawalDay() public view returns (uint256) {
    return s_safekeeperAccountLastWithdrawalDay;
  }

  function getSafekeeperAccountBigWithdrawalDay() public view returns (uint256) {
    return s_safekeeperAccountBigWithdrawalDay;
  }

  function getName() public view returns (string memory) {
    return i_name;
  }

}