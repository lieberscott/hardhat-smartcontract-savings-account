const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

// MAKE SURE IT WORKS FOR TRANSFERRING LINK (DERIVATIVES OF ERC20s)

!developmentChains.includes(network.name)
	? describe.skip
	: describe("Unit Tests", () => {
		let deployer, mainAccount, backupAccount;

		let savingsAccountFactory, factoryContract;

		let savingsAccountContractAddress;

		const mainUserWithdrawalLimit = ethers.utils.parseEther("1");
		const backupUserWithdrawalLimit = ethers.utils.parseEther("0.05");
		const blankAddress = "0x0000000000000000000000000000000000000000";
		const SECONDS_IN_DAY = 86400;

		beforeEach(async () => {
			const accounts = await ethers.getSigners(); // could also do with getNamedAccounts
			deployer = accounts[0];
			mainAccount = accounts[1];
			backupAccount = accounts[2];

			savingsAccountFactory = await ethers.getContractFactory("SavingsAccountFactory");
			factoryContract = await savingsAccountFactory.deploy();

		});

		describe("Factory tests", () => {
			
			it("Factory should start with an empty mainAccountToContractAddress mapping", async function () {
				const contractAddress = await factoryContract.getContractFromMainAddress(mainAccount.address);
				console.log("contractAddress :", contractAddress);
				assert.equal(contractAddress, blankAddress);
			});
	
			it("Factory adds mainAccount to mapping upon savingsAccount deploy", async function() {
				await factoryContract.createSavingsAccount(mainAccount.address, backupAccount.address, mainUserWithdrawalLimit, backupUserWithdrawalLimit, "Scott's Account");
				const contractAddress = await factoryContract.getContractFromMainAddress(mainAccount.address);
				expect(contractAddress).to.not.equal(blankAddress);
			});
	
			it("Factory rejects new savingsAccount if mainUser account already exists", async function() {
				await factoryContract.createSavingsAccount(mainAccount.address, backupAccount.address, mainUserWithdrawalLimit, backupUserWithdrawalLimit, "Scott's Account");
				await expect(factoryContract.createSavingsAccount(mainAccount.address, backupAccount.address, "0", "0", "Al's Account")).to.be.revertedWith(
					"SavingsAccountFactory__AccountAlreadyExists"
				);
			});

			it("Factory rejects new savingsAccount if backupUser account already exists", async function() {
				await factoryContract.createSavingsAccount(mainAccount.address, backupAccount.address, mainUserWithdrawalLimit, backupUserWithdrawalLimit, "Scott's Account");
				await expect(factoryContract.createSavingsAccount(deployer.address, backupAccount.address, "0", "0", "Al's Account")).to.be.revertedWith(
					"SavingsAccountFactory__BackupAccountAlreadyExists"
				);
			});
	
			it("savingsAccount deploy fails if mainWithdrawalLimit is 0", async function() {
				await expect(factoryContract.createSavingsAccount(mainAccount.address, backupAccount.address, "0", "0", "Scott's Account")).to.be.revertedWith(
					"SavingsAccount__MainWithdrawalLimitTooSmall"
				);
			});
	
			it("SavingsAccount contract can receive ETH upon being deployed", async function() {
	
				await factoryContract.createSavingsAccount(mainAccount.address, backupAccount.address, mainUserWithdrawalLimit, backupUserWithdrawalLimit, "Scott's Account", { value: mainUserWithdrawalLimit });
				const address = await factoryContract.getContractFromMainAddress(mainAccount.address);
				const contractBalance = await ethers.provider.getBalance(address);
				
				assert.equal(contractBalance.toString(), mainUserWithdrawalLimit);
			});
	
			it("Factory emits event upon savingsAccount deploy", async () => {
				await expect(factoryContract.createSavingsAccount(mainAccount.address, backupAccount.address, mainUserWithdrawalLimit, backupUserWithdrawalLimit, "Scott's Account")).to.emit(
					factoryContract,
					"SavingsAccountCreated"
				)
				.withArgs(
					mainAccount.address,
					backupAccount.address,
					mainUserWithdrawalLimit,
					backupUserWithdrawalLimit,
					"Scott's Account"
				)
			});
		});


		describe("Child tests", () => {
			
			let instanceContract, instanceContractAsMainUser, instanceContractAsBackupUser;

			beforeEach(async () => {
				// deploy a child savingsAccount contract
				await factoryContract.createSavingsAccount(mainAccount.address, backupAccount.address, mainUserWithdrawalLimit, backupUserWithdrawalLimit, "Scott's Account", { value: ethers.utils.parseEther("3")});
				// get the newly deployed child contract's address
				savingsAccountContractAddress = await factoryContract.getContractFromMainAddress(mainAccount.address);
				// create a connection to the generic SavingsAccount.sol contract
				const savingsAccount = await ethers.getContractFactory("SavingsAccount");
				// get the specific instance of the recently deployed child contract
				instanceContract = savingsAccount.attach(savingsAccountContractAddress);
				// Returns a new instance of the savingsAccount contract connected to mainAccount
				instanceContractAsMainUser = instanceContract.connect(mainAccount);
				// Returns a new instance of the savingsAccount contract connected to backupAccount
				instanceContractAsBackupUser = instanceContract.connect(backupAccount);
			});

			describe("Constructor tests", () => {

				it("Child adds constructor data to contract", async function() {
			
					const returnedMainAccount = await instanceContract.getMainAccount();
					const returnedBackupAccount = await instanceContract.getBackupAccount();
					const returnedMainWithdrawalLimit = await instanceContract.getMainAccountWithdrawalLimit();
					const returnedBackupWithdrawalLimit = await instanceContract.getBackupAccountWithdrawalLimit();
					
					assert.equal(returnedMainAccount, mainAccount.address);
					assert.equal(returnedBackupAccount, backupAccount.address);
					assert.equal(returnedMainWithdrawalLimit.toString(), mainUserWithdrawalLimit);
					assert.equal(returnedBackupWithdrawalLimit.toString(), backupUserWithdrawalLimit);
				});

				it("s_mainAccountLastWithdrawalDay is 0 upon deploy", async function() {
			
					const s_mainAccountLastWithdrawalDay = await instanceContract.getMainAccountLastWithdrawalDay();
					
					assert.equal(s_mainAccountLastWithdrawalDay, 0);
				});

				it("s_backupAccountLastWithdrawalDay is 0 upon deploy", async function() {
			
					const s_backupAccountLastWithdrawalDay = await instanceContract.getBackupAccountLastWithdrawalDay();
					
					assert.equal(s_backupAccountLastWithdrawalDay, 0);
				});

			});

			describe("receive fallback tests", () => {
				it("SavingsAccount contract can receive ETH directly", async function() {

					const startingBalance = await ethers.provider.getBalance(savingsAccountContractAddress);
	
					const sendAmount = ethers.utils.parseEther("1");
	
					const transactionHash = await deployer.sendTransaction({
						to: savingsAccountContractAddress,
						value: sendAmount
					});
				
					const endingBalance = await ethers.provider.getBalance(savingsAccountContractAddress);
					
					assert.equal(endingBalance.toString(), sendAmount.add(startingBalance).toString());
				});
			});


			describe("mainUserWithdrawal tests", () => {
				it("s_mainAccountLastWithdrawalDay updates once mainUser withdraws funds", async function() {
	
					// Make withdrawal as mainUser
					const transactionResponse = await instanceContractAsMainUser.mainUserWithdrawal(mainUserWithdrawalLimit);
	
					const s_mainAccountLastWithdrawalDay = await instanceContract.getMainAccountLastWithdrawalDay();
	
					expect(s_mainAccountLastWithdrawalDay).is.not.equal(0);
					
				});
	
				it("mainUser can use mainUserWithdrawal", async function() {
	
					// Get the mainUser's starting account balance
					const startingBalance = await ethers.provider.getBalance(mainAccount.address);
	
					// Make withdrawal as mainUser
					const transactionResponse = await instanceContractAsMainUser.mainUserWithdrawal(mainUserWithdrawalLimit);
					const transactionReceipt = await transactionResponse.wait(1);
					const { gasUsed, effectiveGasPrice } = transactionReceipt; // 11:30:00 in Patrick Collins' 32-hour FreeCodeCamp Solidity course on YouTube
					const gasCost = gasUsed.mul(effectiveGasPrice);
	
					// Get the mainUser's ending account balance
					const endingBalance = await ethers.provider.getBalance(mainAccount.address);
	
					assert.equal(endingBalance.add(gasCost).toString(), startingBalance.add(mainUserWithdrawalLimit).toString());
				});
	
				it("backupUser can NOT use mainUserWithdrawal", async function() {
	
					// Attempt withdrawal as backupUser
					await expect(instanceContractAsBackupUser.mainUserWithdrawal(mainUserWithdrawalLimit)).to.be.revertedWith(
						"SavingsAccount__notOwner"
					);
				});
	
				it("mainUser can not withdraw more than their withdrawalLimit", async function() {
	
					// Make withdrawal larger than withdrawalLimit
					await expect(instanceContractAsMainUser.mainUserWithdrawal(mainUserWithdrawalLimit.add("1"))).to.be.revertedWith(
						"SavingsAccount__MainWithdrawalTooBig"
					);
				});
	
				it("mainUser can not withdraw more than once per day", async () => {
	
					// Make withdrawal as mainUser
					const transactionResponse = await instanceContractAsMainUser.mainUserWithdrawal(mainUserWithdrawalLimit);
	
					// Attempt to make second withdrawal
					await expect(instanceContractAsMainUser.mainUserWithdrawal(mainUserWithdrawalLimit)).to.be.revertedWith(
						"SavingsAccount__MainWithdrawalAlreadyMadeToday"
					);
				});
	
				it("mainUser can withdraw today, and the next day", async () => {
	
					// Get the mainUser's starting account balance
					const startingBalance = await ethers.provider.getBalance(mainAccount.address);
	
					// Make withdrawal as mainUser and get gasCost1 from the transaction
					const transactionResponse1 = await instanceContractAsMainUser.mainUserWithdrawal(mainUserWithdrawalLimit);
					const transactionReceipt1 = await transactionResponse1.wait(1);
					const gasUsed1 = transactionReceipt1.gasUsed;
					const effectiveGasPrice1 = transactionReceipt1.effectiveGasPrice;
	
					const gasCost1 = gasUsed1.mul(effectiveGasPrice1);
	
					// Simulate time moving forward on blockchain
					// At 15:35:00 in Patrick Collins' 32-hour FreeCodeCamp Solidity course on YouTube
					await network.provider.send("evm_increaseTime", [SECONDS_IN_DAY + 1]);
					await network.provider.request({ method: "evm_mine", params: [] });
	
					// Make withdrawal "next day" and get gasCost2 from the transaction
					const transactionResponse2 = await instanceContractAsMainUser.mainUserWithdrawal(mainUserWithdrawalLimit);
					const transactionReceipt2 = await transactionResponse2.wait(1);
					const gasUsed2 = transactionReceipt2.gasUsed;
					const effectiveGasPrice2 = transactionReceipt2.effectiveGasPrice;
	
					const gasCost2 = gasUsed2.mul(effectiveGasPrice2);
	
					// get total gas cost to add back to the endingBalance (since it will have been lost)
					const gasCostTotal = gasCost1.add(gasCost2);
	
					// Get the mainUser's ending account balance
					const endingBalance = await ethers.provider.getBalance(mainAccount.address);
	
					assert.equal(endingBalance.add(gasCostTotal).toString(), startingBalance.add(mainUserWithdrawalLimit).add(mainUserWithdrawalLimit).toString());
	
				});
			});

			describe("backupUserWithdrawal tests", () => {
				it("s_backupAccountLastWithdrawalDay updates once backupUser withdraws funds", async function() {
	
					// Make withdrawal as backupUser
					const transactionResponse = await instanceContractAsBackupUser.backupUserWithdrawal(backupUserWithdrawalLimit);
	
					const s_backupAccountLastWithdrawalDay = await instanceContract.getBackupAccountLastWithdrawalDay();
	
					expect(s_backupAccountLastWithdrawalDay).is.not.equal(0);
					
				});
	
				it("backupUser can use backupUserWithdrawal", async function() {
	
					// Get the backupUser's starting account balance
					const startingBalance = await ethers.provider.getBalance(backupAccount.address);
	
					// Make withdrawal as backupUser
					const transactionResponse = await instanceContractAsBackupUser.backupUserWithdrawal(backupUserWithdrawalLimit);
					const transactionReceipt = await transactionResponse.wait(1);
					const { gasUsed, effectiveGasPrice } = transactionReceipt; // 11:30:00 in Patrick Collins' 32-hour FreeCodeCamp Solidity course on YouTube
					const gasCost = gasUsed.mul(effectiveGasPrice);
	
					// Get the backupUser's ending account balance
					const endingBalance = await ethers.provider.getBalance(backupAccount.address);
	
					assert.equal(endingBalance.add(gasCost).toString(), startingBalance.add(backupUserWithdrawalLimit).toString());
				});
	
				it("mainUser can NOT use backupUserWithdrawal", async function() {
	
					// Attempt withdrawal as backupUser
					await expect(instanceContractAsMainUser.backupUserWithdrawal(backupUserWithdrawalLimit)).to.be.revertedWith(
						"SavingsAccount__notBackup"
					);
				});
	
				it("backupUser can not withdraw more than their withdrawalLimit", async function() {
	
					// Make withdrawal larger than withdrawalLimit
					await expect(instanceContractAsBackupUser.backupUserWithdrawal(backupUserWithdrawalLimit.add("1"))).to.be.revertedWith(
						"SavingsAccount__BackupWithdrawalTooBig"
					);
				});
	
				it("backupUser can not withdraw more than once per day", async () => {
	
					// Make withdrawal as backupUser
					const transactionResponse = await instanceContractAsBackupUser.backupUserWithdrawal(backupUserWithdrawalLimit);
	
					// Attempt to make second withdrawal
					await expect(instanceContractAsBackupUser.backupUserWithdrawal(backupUserWithdrawalLimit)).to.be.revertedWith(
						"SavingsAccount__BackupWithdrawalAlreadyMadeToday"
					);
				});
	
				it("backupUser can withdraw today, and the next day", async () => {
	
					// Get the backupUser's starting account balance
					const startingBalance = await ethers.provider.getBalance(backupAccount.address);
	
					// Make withdrawal as backupUser and get gasCost1 from the transaction
					const transactionResponse1 = await instanceContractAsBackupUser.backupUserWithdrawal(backupUserWithdrawalLimit);
					const transactionReceipt1 = await transactionResponse1.wait(1);
					const gasUsed1 = transactionReceipt1.gasUsed;
					const effectiveGasPrice1 = transactionReceipt1.effectiveGasPrice;
	
					const gasCost1 = gasUsed1.mul(effectiveGasPrice1);
	
					// Simulate time moving forward on blockchain
					// At 15:35:00 in Patrick Collins' 32-hour FreeCodeCamp Solidity course on YouTube
					await network.provider.send("evm_increaseTime", [SECONDS_IN_DAY + 1]);
					await network.provider.request({ method: "evm_mine", params: [] });
	
					// Make withdrawal "next day" and get gasCost2 from the transaction
					const transactionResponse2 = await instanceContractAsBackupUser.backupUserWithdrawal(backupUserWithdrawalLimit);
					const transactionReceipt2 = await transactionResponse2.wait(1);
					const gasUsed2 = transactionReceipt2.gasUsed;
					const effectiveGasPrice2 = transactionReceipt2.effectiveGasPrice;
	
					const gasCost2 = gasUsed2.mul(effectiveGasPrice2);
	
					// get total gas cost to add back to the endingBalance (since it will have been lost)
					const gasCostTotal = gasCost1.add(gasCost2);
	
					// Get the backupUser's ending account balance
					const endingBalance = await ethers.provider.getBalance(backupAccount.address);
	
					assert.equal(endingBalance.add(gasCostTotal).toString(), startingBalance.add(backupUserWithdrawalLimit).add(backupUserWithdrawalLimit).toString());
	
				});
			});

			describe("Big Withdrawal tests", () => {
				it("mainUser can not make big withdrawal without authorization", async function() {

					// Get the account's balance
					const balance = await ethers.provider.getBalance(savingsAccountContractAddress);
	
					// Make withdrawal larger than withdrawalLimit
					await expect(instanceContractAsMainUser.mainAccountMakeBigWithdrawal(balance, mainAccount.address)).to.be.revertedWith(
						"SavingsAccount__LargeWithdrawalNotAuthorized"
					);
				});

				it("backupUser can authorize big withdrawal", async function() {

					const transaction = await instanceContractAsBackupUser.backupAccountEnableBigWithdrawal();

					const s_backupAccountBigWithdrawalDay = await instanceContract.getBackupAccountBigWithdrawalDay();
	
					expect(s_backupAccountBigWithdrawalDay).is.not.equal(0);

				});

				it("no other account can authorize big withdrawal", async function() {

					await expect(instanceContractAsMainUser.backupAccountEnableBigWithdrawal()).to.be.revertedWith(
						"SavingsAccount__notBackup"
					);

				});

				it("mainUser can make a big withdrawal after backupUser authorizes big withdrawal", async function() {

					// Get the mainUser's starting account balance
					const startingBalance = await ethers.provider.getBalance(mainAccount.address);

					// Get the account's balance
					const accountBalance = await ethers.provider.getBalance(savingsAccountContractAddress);

					// Enable big withdrawal
					const transaction = await instanceContractAsBackupUser.backupAccountEnableBigWithdrawal();
	
					// Make withdrawal as mainUser and get gasCost from the transaction
					const transactionResponse = await instanceContractAsMainUser.mainAccountMakeBigWithdrawal(accountBalance, mainAccount.address);
					const transactionReceipt = await transactionResponse.wait(1);
					const { gasUsed, effectiveGasPrice } = transactionReceipt;
	
					const gasCost = gasUsed.mul(effectiveGasPrice);

	
					// Get the mainUser's ending account balance
					const endingBalance = await ethers.provider.getBalance(mainAccount.address);
	
					assert.equal(endingBalance.add(gasCost).toString(), startingBalance.add(accountBalance).toString());
				});

				it("mainUser can not make a big withdrawal THE DAY AFTER backupUser enables a big withdrawal", async () => {
	
					// Get the account's balance
					const accountBalance = await ethers.provider.getBalance(savingsAccountContractAddress);

					// Enable big withdrawal
					const transaction = await instanceContractAsBackupUser.backupAccountEnableBigWithdrawal();
	
					// Simulate time moving forward on blockchain
					// At 15:35:00 in Patrick Collins' 32-hour FreeCodeCamp Solidity course on YouTube
					await network.provider.send("evm_increaseTime", [SECONDS_IN_DAY + 1]);
					await network.provider.request({ method: "evm_mine", params: [] });
	
					// Attempt to make big withdrawal "next day" 
					await expect(instanceContractAsMainUser.mainAccountMakeBigWithdrawal(accountBalance, mainAccount.address)).to.be.revertedWith(
						"SavingsAccount__LargeWithdrawalNotAuthorized"
					);
				});
			});

			describe("Token tests", () => {
				// it can receive ERC20 tokens and have a balance
				// it can send ERC20 tokens and its balance is reduced, and the mainAccount is increased
				let myToken, myTokenContract, tokenContractAddress, ercInstanceAsMainAccount;

				const startingBalance = 1000;
				const transferAmount = 50;

				beforeEach(async () => {
					myToken = await ethers.getContractFactory("MyToken");
					// add 1000 of MyTokens to the savingsAccountContractAddress, and the mainAccount
					myTokenContract = await myToken.deploy(savingsAccountContractAddress, mainAccount.address, startingBalance);
					tokenContractAddress = myTokenContract.address;
					// const ercInstanceContract = myToken.attach(tokenContractAddress);
					const signerMain = await ethers.getSigner(mainAccount.address);
					ercInstanceAsMainAccount = myTokenContract.connect(signerMain);
				});

				it("savingsAccount can receive ERC20 tokens", async () => {
					await ercInstanceAsMainAccount.transfer(savingsAccountContractAddress, transferAmount);
					const mainAccountBalance = await ercInstanceAsMainAccount.balanceOf(mainAccount.address);
					const savingsAccountBalance = await ercInstanceAsMainAccount.balanceOf(savingsAccountContractAddress);

					assert.equal(mainAccountBalance, startingBalance - transferAmount);
					assert.equal(savingsAccountBalance, startingBalance + transferAmount);
				});

				it("mainUser can NOT send ERC20 tokens from savingsAccount before setting limits", async () => {
					await expect(instanceContractAsMainUser.transferErcTokenMain(tokenContractAddress, transferAmount)).to.be.revertedWith(
						"SavingsAccount__MainWithdrawalTooBig"
					);
				});

				it("only mainUser can call transferErcTokenMain function", async () => {
					// Set the withdrawal limits for the contract, mainUserLimit, backupUserLimit
					await instanceContractAsMainUser.setTokenLimits(tokenContractAddress, transferAmount, transferAmount);

					await expect(instanceContractAsBackupUser.transferErcTokenMain(tokenContractAddress, transferAmount)).to.be.revertedWith(
						"SavingsAccount__notOwner"
					);
				});

				it("only backupUser can call transferErcTokenBackup function", async () => {
					// Set the withdrawal limits for the contract, mainUserLimit, backupUserLimit
					await instanceContractAsMainUser.setTokenLimits(tokenContractAddress, transferAmount, transferAmount);

					await expect(instanceContractAsMainUser.transferErcTokenBackup(tokenContractAddress, transferAmount)).to.be.revertedWith(
						"SavingsAccount__notBackup"
					);
				});

				it("mainUser can send ERC20 tokens from savingsAccount back to herself after setting withdrawal limits", async () => {
					// Set the withdrawal limits for the contract, mainUserLimit, backupUserLimit
					await instanceContractAsMainUser.setTokenLimits(tokenContractAddress, transferAmount, transferAmount);

					// Make the transfer
					await instanceContractAsMainUser.transferErcTokenMain(tokenContractAddress, transferAmount);
					const mainAccountBalance = await myTokenContract.balanceOf(mainAccount.address);
					const savingsAccountBalance = await myTokenContract.balanceOf(savingsAccountContractAddress);

					assert.equal(mainAccountBalance, startingBalance + transferAmount);
					assert.equal(savingsAccountBalance, startingBalance - transferAmount);
				});

				it("backupUser can send ERC20 tokens from savingsAccount to herself after mainUser sets withdrawal limits", async () => {
					// Main user sets the withdrawal limits for the contract, mainUserLimit, backupUserLimit
					await instanceContractAsMainUser.setTokenLimits(tokenContractAddress, transferAmount, transferAmount);

					// Backup user makes the transfer
					await instanceContractAsBackupUser.transferErcTokenBackup(tokenContractAddress, transferAmount);
					const backupAccountBalance = await myTokenContract.balanceOf(backupAccount.address);
					const savingsAccountBalance = await myTokenContract.balanceOf(savingsAccountContractAddress);

					assert.equal(backupAccountBalance, transferAmount);
					assert.equal(savingsAccountBalance, startingBalance - transferAmount);
				});

				it("ERC20 tokens can not be transferred more than once per day by mainAccount", async () => {
					// Set the withdrawal limits for the contract, mainUserLimit, backupUserLimit
					await instanceContractAsMainUser.setTokenLimits(tokenContractAddress, transferAmount, transferAmount);

					// Make the transfer
					await instanceContractAsMainUser.transferErcTokenMain(tokenContractAddress, transferAmount);

					await expect(instanceContractAsMainUser.transferErcTokenMain(tokenContractAddress, transferAmount)).to.be.revertedWith(
						"SavingsAccount__MainWithdrawalAlreadyMadeToday"
					);
				});

				it("ERC20 tokens can not be transferred more than once per day by backupAccount", async () => {
					// Set the withdrawal limits for the contract, mainUserLimit, backupUserLimit
					await instanceContractAsMainUser.setTokenLimits(tokenContractAddress, transferAmount, transferAmount);

					// Make the transfer
					await instanceContractAsBackupUser.transferErcTokenBackup(tokenContractAddress, transferAmount);

					await expect(instanceContractAsBackupUser.transferErcTokenBackup(tokenContractAddress, transferAmount)).to.be.revertedWith(
						"SavingsAccount__BackupWithdrawalAlreadyMadeToday"
					);
				});

				it("ERC20 tokens can be transferred by mainUser after a day has passed", async () => {
					// Set the withdrawal limits for the contract, mainUserLimit, backupUserLimit
					await instanceContractAsMainUser.setTokenLimits(tokenContractAddress, transferAmount, transferAmount);

					// Make the transfer
					await instanceContractAsMainUser.transferErcTokenMain(tokenContractAddress, transferAmount);

					// Simulate time moving forward on blockchain
					// At 15:35:00 in Patrick Collins' 32-hour FreeCodeCamp Solidity course on YouTube
					await network.provider.send("evm_increaseTime", [SECONDS_IN_DAY + 1]);
					await network.provider.request({ method: "evm_mine", params: [] });

					// Make the next-day transfer
					await instanceContractAsMainUser.transferErcTokenMain(tokenContractAddress, transferAmount);

					const mainAccountBalance = await myTokenContract.balanceOf(mainAccount.address);
					const savingsAccountBalance = await myTokenContract.balanceOf(savingsAccountContractAddress);

					assert.equal(mainAccountBalance, startingBalance + transferAmount + transferAmount);
					assert.equal(savingsAccountBalance, startingBalance - transferAmount - transferAmount);
				});

				it("ERC20 tokens can be transferred by backupUser after a day has passed", async () => {
					// Set the withdrawal limits for the contract, mainUserLimit, backupUserLimit
					await instanceContractAsMainUser.setTokenLimits(tokenContractAddress, transferAmount, transferAmount);

					// Make the transfer
					await instanceContractAsBackupUser.transferErcTokenBackup(tokenContractAddress, transferAmount);

					// Simulate time moving forward on blockchain
					// At 15:35:00 in Patrick Collins' 32-hour FreeCodeCamp Solidity course on YouTube
					await network.provider.send("evm_increaseTime", [SECONDS_IN_DAY + 1]);
					await network.provider.request({ method: "evm_mine", params: [] });

					// Make the next-day transfer
					await instanceContractAsBackupUser.transferErcTokenBackup(tokenContractAddress, transferAmount);

					const backupAccountBalance = await myTokenContract.balanceOf(backupAccount.address);
					const savingsAccountBalance = await myTokenContract.balanceOf(savingsAccountContractAddress);

					assert.equal(backupAccountBalance, transferAmount + transferAmount);
					assert.equal(savingsAccountBalance, startingBalance - transferAmount - transferAmount);
				});

				it("Large ERC20 tokens can be transferred after enabled by backupUser", async () => {
					// Enable big withdrawals
					await instanceContractAsBackupUser.backupAccountEnableBigWithdrawal();

					// Make the transfer
					await instanceContractAsMainUser.mainAccountMakeBigTokenWithdrawal(tokenContractAddress, transferAmount + 1, mainAccount.address);

					const mainAccountBalance = await myTokenContract.balanceOf(mainAccount.address);
					const savingsAccountBalance = await myTokenContract.balanceOf(savingsAccountContractAddress);

					assert.equal(mainAccountBalance, startingBalance + transferAmount + 1);
					assert.equal(savingsAccountBalance, startingBalance - transferAmount - 1);
				});

				it("Large ERC20 tokens can be transferred to another account", async () => {
					// Enable big withdrawals
					await instanceContractAsBackupUser.backupAccountEnableBigWithdrawal();

					// Make the transfer
					await instanceContractAsMainUser.mainAccountMakeBigTokenWithdrawal(tokenContractAddress, transferAmount + 1, deployer.address);

					const deployerAccountBalance = await myTokenContract.balanceOf(deployer.address);
					const savingsAccountBalance = await myTokenContract.balanceOf(savingsAccountContractAddress);

					assert.equal(deployerAccountBalance, transferAmount + 1);
					assert.equal(savingsAccountBalance, startingBalance - transferAmount - 1);
				});
			});

		});


		// test for reentrancy

})