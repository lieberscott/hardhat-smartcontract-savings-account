const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

// MAKE SURE IT WORKS FOR TRANSFERRING LINK (DERIVATIVES OF ERC20s)

!developmentChains.includes(network.name)
	? describe.skip
	: describe("Unit Tests", () => {
		let deployer, mainAccount, safekeeperAccount;

		let savingsAccountFactory, factoryContract;

		let savingsAccountContractAddress;

		const mainUserWithdrawalLimit = ethers.utils.parseEther("1");
		const safekeeperUserWithdrawalLimit = ethers.utils.parseEther("0.05");
		const blankAddress = "0x0000000000000000000000000000000000000000";
		const SECONDS_IN_DAY = 86400;

		beforeEach(async () => {
			const accounts = await ethers.getSigners(); // could also do with getNamedAccounts
			deployer = accounts[0];
			mainAccount = accounts[1];
			safekeeperAccount = accounts[2];

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
				await factoryContract.createSavingsAccount(mainAccount.address, safekeeperAccount.address, mainUserWithdrawalLimit, safekeeperUserWithdrawalLimit, "Scott's Account");
				const contractAddress = await factoryContract.getContractFromMainAddress(mainAccount.address);
				expect(contractAddress).to.not.equal(blankAddress);
			});
	
			it("Factory rejects new savingsAccount if mainUser account already exists", async function() {
				await factoryContract.createSavingsAccount(mainAccount.address, safekeeperAccount.address, mainUserWithdrawalLimit, safekeeperUserWithdrawalLimit, "Scott's Account");
				await expect(factoryContract.createSavingsAccount(mainAccount.address, safekeeperAccount.address, "1", "1", "Al's Account")).to.be.revertedWith(
					"SavingsAccountFactory__AccountAlreadyExists"
				);
			});

			it("Factory rejects new savingsAccount if safekeeperUser account already exists", async function() {
				await factoryContract.createSavingsAccount(mainAccount.address, safekeeperAccount.address, mainUserWithdrawalLimit, safekeeperUserWithdrawalLimit, "Scott's Account");
				await expect(factoryContract.createSavingsAccount(deployer.address, safekeeperAccount.address, "0", "0", "Al's Account")).to.be.revertedWith(
					"SavingsAccountFactory__SafekeeperAccountAlreadyExists"
				);
			});
	
			it("savingsAccount deploy fails if mainWithdrawalLimit is 0", async function() {
				await expect(factoryContract.createSavingsAccount(mainAccount.address, safekeeperAccount.address, "0", "0", "Scott's Account")).to.be.revertedWith(
					"SavingsAccount__MainWithdrawalLimitTooSmall"
				);
			});
	
			it("SavingsAccount contract can receive ETH upon being deployed", async function() {
	
				await factoryContract.createSavingsAccount(mainAccount.address, safekeeperAccount.address, mainUserWithdrawalLimit, safekeeperUserWithdrawalLimit, "Scott's Account", { value: mainUserWithdrawalLimit });
				const address = await factoryContract.getContractFromMainAddress(mainAccount.address);
				const contractBalance = await ethers.provider.getBalance(address);
				
				assert.equal(contractBalance.toString(), mainUserWithdrawalLimit);
			});
	
			it("Factory emits event upon savingsAccount deploy", async () => {
				await expect(factoryContract.createSavingsAccount(mainAccount.address, safekeeperAccount.address, mainUserWithdrawalLimit, safekeeperUserWithdrawalLimit, "Scott's Account")).to.emit(
					factoryContract,
					"SavingsAccountCreated"
				)
				.withArgs(
					mainAccount.address,
					safekeeperAccount.address,
					mainUserWithdrawalLimit,
					safekeeperUserWithdrawalLimit,
					"Scott's Account"
				)
			});
		});


		describe("Child tests", () => {
			
			let instanceContract, instanceContractAsMainUser, instanceContractAsSafekeeperUser;

			beforeEach(async () => {
				// deploy a child savingsAccount contract
				await factoryContract.createSavingsAccount(mainAccount.address, safekeeperAccount.address, mainUserWithdrawalLimit, safekeeperUserWithdrawalLimit, "Scott's Account", { value: ethers.utils.parseEther("2.9")});
				// get the newly deployed child contract's address
				savingsAccountContractAddress = await factoryContract.getContractFromMainAddress(mainAccount.address);
				// create a connection to the generic SavingsAccount.sol contract
				const savingsAccount = await ethers.getContractFactory("SavingsAccount");
				// get the specific instance of the recently deployed child contract
				instanceContract = savingsAccount.attach(savingsAccountContractAddress);
				// Returns a new instance of the savingsAccount contract connected to mainAccount
				instanceContractAsMainUser = instanceContract.connect(mainAccount);
				// Returns a new instance of the savingsAccount contract connected to safekeeperAccount
				instanceContractAsSafekeeperUser = instanceContract.connect(safekeeperAccount);
			});

			describe("Constructor tests", () => {

				it("Child adds constructor data to contract", async function() {
			
					const returnedMainAccount = await instanceContract.getMainAccount();
					const returnedSafekeeperAccount = await instanceContract.getSafekeeperAccount();
					const returnedMainWithdrawalLimit = await instanceContract.getMainAccountWithdrawalLimit();
					const returnedSafekeeperWithdrawalLimit = await instanceContract.getSafekeeperAccountWithdrawalLimit();
					
					assert.equal(returnedMainAccount, mainAccount.address);
					assert.equal(returnedSafekeeperAccount, safekeeperAccount.address);
					assert.equal(returnedMainWithdrawalLimit.toString(), mainUserWithdrawalLimit);
					assert.equal(returnedSafekeeperWithdrawalLimit.toString(), safekeeperUserWithdrawalLimit);
				});

				it("s_mainAccountLastWithdrawalDay is 0 upon deploy", async function() {
			
					const s_mainAccountLastWithdrawalDay = await instanceContract.getMainAccountLastWithdrawalDay();
					
					assert.equal(s_mainAccountLastWithdrawalDay, 0);
				});

				it("s_safekeeperAccountLastWithdrawalDay is 0 upon deploy", async function() {
			
					const s_safekeeperAccountLastWithdrawalDay = await instanceContract.getSafekeeperAccountLastWithdrawalDay();
					
					assert.equal(s_safekeeperAccountLastWithdrawalDay, 0);
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
					const transactionResponse = await instanceContractAsMainUser.mainUserWithdrawal();
	
					const s_mainAccountLastWithdrawalDay = await instanceContract.getMainAccountLastWithdrawalDay();
	
					expect(s_mainAccountLastWithdrawalDay).is.not.equal(0);
					
				});
	
				it("mainUser can use mainUserWithdrawal", async function() {
	
					// Get the mainUser's starting account balance
					const startingBalance = await ethers.provider.getBalance(mainAccount.address);
	
					// Make withdrawal as mainUser
					const transactionResponse = await instanceContractAsMainUser.mainUserWithdrawal();
					const transactionReceipt = await transactionResponse.wait(1);
					const { gasUsed, effectiveGasPrice } = transactionReceipt; // 11:30:00 in Patrick Collins' 32-hour FreeCodeCamp Solidity course on YouTube
					const gasCost = gasUsed.mul(effectiveGasPrice);
	
					// Get the mainUser's ending account balance
					const endingBalance = await ethers.provider.getBalance(mainAccount.address);
	
					assert.equal(endingBalance.add(gasCost).toString(), startingBalance.add(mainUserWithdrawalLimit).toString());
				});
	
				it("safekeeperUser can NOT use mainUserWithdrawal", async function() {
	
					// Attempt withdrawal as safekeeperUser
					await expect(instanceContractAsSafekeeperUser.mainUserWithdrawal()).to.be.revertedWith(
						"SavingsAccount__notOwner"
					);
				});
	
				
	
				it("mainUser can not withdraw more than once per day", async () => {
	
					// Make withdrawal as mainUser
					const transactionResponse = await instanceContractAsMainUser.mainUserWithdrawal();
	
					// Attempt to make second withdrawal
					await expect(instanceContractAsMainUser.mainUserWithdrawal()).to.be.revertedWith(
						"SavingsAccount__MainWithdrawalAlreadyMadeToday"
					);
				});
	
				it("mainUser can withdraw today, and the next day", async () => {
	
					// Get the mainUser's starting account balance
					const startingBalance = await ethers.provider.getBalance(mainAccount.address);
	
					// Make withdrawal as mainUser and get gasCost1 from the transaction
					const transactionResponse1 = await instanceContractAsMainUser.mainUserWithdrawal();
					const transactionReceipt1 = await transactionResponse1.wait(1);
					const gasUsed1 = transactionReceipt1.gasUsed;
					const effectiveGasPrice1 = transactionReceipt1.effectiveGasPrice;
	
					const gasCost1 = gasUsed1.mul(effectiveGasPrice1);
	
					// Simulate time moving forward on blockchain
					// At 15:35:00 in Patrick Collins' 32-hour FreeCodeCamp Solidity course on YouTube
					await network.provider.send("evm_increaseTime", [SECONDS_IN_DAY + 1]);
					await network.provider.request({ method: "evm_mine", params: [] });
	
					// Make withdrawal "next day" and get gasCost2 from the transaction
					const transactionResponse2 = await instanceContractAsMainUser.mainUserWithdrawal();
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

				it("if balance is smaller than withdrawal amount, the remaining balance is withdrawn", async () => {
	
					// Get the mainUser's starting account balance
					const startingBalance = await ethers.provider.getBalance(mainAccount.address);
	
					// Make withdrawal as mainUser and get gasCost1 from the transaction
					const transactionResponse1 = await instanceContractAsMainUser.mainUserWithdrawal();
					const transactionReceipt1 = await transactionResponse1.wait(1);
					const gasUsed1 = transactionReceipt1.gasUsed;
					const effectiveGasPrice1 = transactionReceipt1.effectiveGasPrice;
	
					const gasCost1 = gasUsed1.mul(effectiveGasPrice1);
	
					// Simulate time moving forward on blockchain
					// At 15:35:00 in Patrick Collins' 32-hour FreeCodeCamp Solidity course on YouTube
					await network.provider.send("evm_increaseTime", [SECONDS_IN_DAY + 1]);
					await network.provider.request({ method: "evm_mine", params: [] });
	
					// Make withdrawal "next day" and get gasCost2 from the transaction
					const transactionResponse2 = await instanceContractAsMainUser.mainUserWithdrawal();
					const transactionReceipt2 = await transactionResponse2.wait(1);
					const gasUsed2 = transactionReceipt2.gasUsed;
					const effectiveGasPrice2 = transactionReceipt2.effectiveGasPrice;
	
					const gasCost2 = gasUsed2.mul(effectiveGasPrice2);

					// Simulate time moving forward on blockchain
					// At 15:35:00 in Patrick Collins' 32-hour FreeCodeCamp Solidity course on YouTube
					await network.provider.send("evm_increaseTime", [SECONDS_IN_DAY + 1]);
					await network.provider.request({ method: "evm_mine", params: [] });


					// Get remaining contract balance (0.9 ETH)
					const contractBalance3 = await ethers.provider.getBalance(instanceContract.address)


					// Make "third day" withdrawal as mainUser and get gasCost3 from the transaction
					const transactionResponse3 = await instanceContractAsMainUser.mainUserWithdrawal();
					const transactionReceipt3 = await transactionResponse3.wait(1);
					const gasUsed3 = transactionReceipt3.gasUsed;
					const effectiveGasPrice3 = transactionReceipt3.effectiveGasPrice;
	
					const gasCost3 = gasUsed3.mul(effectiveGasPrice3);

	
					// get total gas cost to add back to the endingBalance (since it will have been lost)
					const gasCostTotal = gasCost1.add(gasCost2).add(gasCost3);
	
					// Get the mainUser's ending account balance
					const endingBalance = await ethers.provider.getBalance(mainAccount.address);

					const contractBalanceEnd = await ethers.provider.getBalance(instanceContract.address)
	
					assert.equal(endingBalance.add(gasCostTotal).toString(), startingBalance.add(mainUserWithdrawalLimit).add(mainUserWithdrawalLimit).add(contractBalance3).toString());
					assert.equal(contractBalanceEnd.toString(), "0")
				});
			});

			describe("safekeeperUserWithdrawal tests", () => {
				it("s_safekeeperAccountLastWithdrawalDay updates once safekeeperUser withdraws funds", async function() {
	
					// Make withdrawal as safekeeperUser
					const transactionResponse = await instanceContractAsSafekeeperUser.safekeeperUserWithdrawal();
	
					const s_safekeeperAccountLastWithdrawalDay = await instanceContract.getSafekeeperAccountLastWithdrawalDay();
	
					expect(s_safekeeperAccountLastWithdrawalDay).is.not.equal(0);
					
				});
	
				it("safekeeperUser can use safekeeperUserWithdrawal", async function() {
	
					// Get the safekeeperUser's starting account balance
					const startingBalance = await ethers.provider.getBalance(safekeeperAccount.address);
	
					// Make withdrawal as safekeeperUser
					const transactionResponse = await instanceContractAsSafekeeperUser.safekeeperUserWithdrawal();
					const transactionReceipt = await transactionResponse.wait(1);
					const { gasUsed, effectiveGasPrice } = transactionReceipt; // 11:30:00 in Patrick Collins' 32-hour FreeCodeCamp Solidity course on YouTube
					const gasCost = gasUsed.mul(effectiveGasPrice);
	
					// Get the safekeeperUser's ending account balance
					const endingBalance = await ethers.provider.getBalance(safekeeperAccount.address);
	
					assert.equal(endingBalance.add(gasCost).toString(), startingBalance.add(safekeeperUserWithdrawalLimit).toString());
				});
	
				it("mainUser can NOT use safekeeperUserWithdrawal", async function() {
	
					// Attempt withdrawal as safekeeperUser
					await expect(instanceContractAsMainUser.safekeeperUserWithdrawal()).to.be.revertedWith(
						"SavingsAccount__notSafekeeper"
					);
				});
	
				it("safekeeperUser can not withdraw more than once per day", async () => {
	
					// Make withdrawal as safekeeperUser
					const transactionResponse = await instanceContractAsSafekeeperUser.safekeeperUserWithdrawal();
	
					// Attempt to make second withdrawal
					await expect(instanceContractAsSafekeeperUser.safekeeperUserWithdrawal()).to.be.revertedWith(
						"SavingsAccount__SafekeeperWithdrawalAlreadyMadeToday"
					);
				});
	
				it("safekeeperUser can withdraw today, and the next day", async () => {
	
					// Get the safekeeperUser's starting account balance
					const startingBalance = await ethers.provider.getBalance(safekeeperAccount.address);
	
					// Make withdrawal as safekeeperUser and get gasCost1 from the transaction
					const transactionResponse1 = await instanceContractAsSafekeeperUser.safekeeperUserWithdrawal();
					const transactionReceipt1 = await transactionResponse1.wait(1);
					const gasUsed1 = transactionReceipt1.gasUsed;
					const effectiveGasPrice1 = transactionReceipt1.effectiveGasPrice;
	
					const gasCost1 = gasUsed1.mul(effectiveGasPrice1);
	
					// Simulate time moving forward on blockchain
					// At 15:35:00 in Patrick Collins' 32-hour FreeCodeCamp Solidity course on YouTube
					await network.provider.send("evm_increaseTime", [SECONDS_IN_DAY + 1]);
					await network.provider.request({ method: "evm_mine", params: [] });
	
					// Make withdrawal "next day" and get gasCost2 from the transaction
					const transactionResponse2 = await instanceContractAsSafekeeperUser.safekeeperUserWithdrawal();
					const transactionReceipt2 = await transactionResponse2.wait(1);
					const gasUsed2 = transactionReceipt2.gasUsed;
					const effectiveGasPrice2 = transactionReceipt2.effectiveGasPrice;
	
					const gasCost2 = gasUsed2.mul(effectiveGasPrice2);
	
					// get total gas cost to add back to the endingBalance (since it will have been lost)
					const gasCostTotal = gasCost1.add(gasCost2);
	
					// Get the safekeeperUser's ending account balance
					const endingBalance = await ethers.provider.getBalance(safekeeperAccount.address);
	
					assert.equal(endingBalance.add(gasCostTotal).toString(), startingBalance.add(safekeeperUserWithdrawalLimit).add(safekeeperUserWithdrawalLimit).toString());
	
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

				it("safekeeperUser can authorize big withdrawal", async function() {

					const transaction = await instanceContractAsSafekeeperUser.safekeeperAccountEnableBigWithdrawal();

					const s_safekeeperAccountBigWithdrawalDay = await instanceContract.getSafekeeperAccountBigWithdrawalDay();
	
					expect(s_safekeeperAccountBigWithdrawalDay).is.not.equal(0);

				});

				it("no other account can authorize big withdrawal", async function() {

					await expect(instanceContractAsMainUser.safekeeperAccountEnableBigWithdrawal()).to.be.revertedWith(
						"SavingsAccount__notSafekeeper"
					);

				});

				it("mainUser can make a big withdrawal after safekeeperUser authorizes big withdrawal", async function() {

					// Get the mainUser's starting account balance
					const startingBalance = await ethers.provider.getBalance(mainAccount.address);

					// Get the account's balance
					const accountBalance = await ethers.provider.getBalance(savingsAccountContractAddress);

					// Enable big withdrawal
					const transaction = await instanceContractAsSafekeeperUser.safekeeperAccountEnableBigWithdrawal();
	
					// Make withdrawal as mainUser and get gasCost from the transaction
					const transactionResponse = await instanceContractAsMainUser.mainAccountMakeBigWithdrawal(accountBalance, mainAccount.address);
					const transactionReceipt = await transactionResponse.wait(1);
					const { gasUsed, effectiveGasPrice } = transactionReceipt;
	
					const gasCost = gasUsed.mul(effectiveGasPrice);

	
					// Get the mainUser's ending account balance
					const endingBalance = await ethers.provider.getBalance(mainAccount.address);
	
					assert.equal(endingBalance.add(gasCost).toString(), startingBalance.add(accountBalance).toString());
				});

				it("mainUser can not make a big withdrawal THE DAY AFTER safekeeperUser enables a big withdrawal", async () => {
	
					// Get the account's balance
					const accountBalance = await ethers.provider.getBalance(savingsAccountContractAddress);

					// Enable big withdrawal
					const transaction = await instanceContractAsSafekeeperUser.safekeeperAccountEnableBigWithdrawal();
	
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

				it("only mainUser can call transferErcTokenMain function", async () => {
					// Set the withdrawal limits for the contract, mainUserLimit, safekeeperUserLimit
					await instanceContractAsMainUser.setTokenLimits(tokenContractAddress, transferAmount, transferAmount);

					await expect(instanceContractAsSafekeeperUser.transferErcTokenMain(tokenContractAddress)).to.be.revertedWith(
						"SavingsAccount__notOwner"
					);
				});

				it("only safekeeperUser can call transferErcTokenSafekeeper function", async () => {
					// Set the withdrawal limits for the contract, mainUserLimit, safekeeperUserLimit
					await instanceContractAsMainUser.setTokenLimits(tokenContractAddress, transferAmount, transferAmount);

					await expect(instanceContractAsMainUser.transferErcTokenSafekeeper(tokenContractAddress)).to.be.revertedWith(
						"SavingsAccount__notSafekeeper"
					);
				});

				it("mainUser can send ERC20 tokens from savingsAccount back to herself after setting withdrawal limits", async () => {
					// Set the withdrawal limits for the contract, mainUserLimit, safekeeperUserLimit
					await instanceContractAsMainUser.setTokenLimits(tokenContractAddress, transferAmount, transferAmount);

					// Make the transfer
					await instanceContractAsMainUser.transferErcTokenMain(tokenContractAddress);
					const mainAccountBalance = await myTokenContract.balanceOf(mainAccount.address);
					const savingsAccountBalance = await myTokenContract.balanceOf(savingsAccountContractAddress);

					assert.equal(mainAccountBalance, startingBalance + transferAmount);
					assert.equal(savingsAccountBalance, startingBalance - transferAmount);
				});

				it("safekeeperUser can send ERC20 tokens from savingsAccount to herself after mainUser sets withdrawal limits", async () => {
					// Main user sets the withdrawal limits for the contract, mainUserLimit, safekeeperUserLimit
					await instanceContractAsMainUser.setTokenLimits(tokenContractAddress, transferAmount, transferAmount);

					// Safekeeper user makes the transfer
					await instanceContractAsSafekeeperUser.transferErcTokenSafekeeper(tokenContractAddress);
					const safekeeperAccountBalance = await myTokenContract.balanceOf(safekeeperAccount.address);
					const savingsAccountBalance = await myTokenContract.balanceOf(savingsAccountContractAddress);

					assert.equal(safekeeperAccountBalance, transferAmount);
					assert.equal(savingsAccountBalance, startingBalance - transferAmount);
				});

				it("ERC20 tokens can not be transferred more than once per day by mainAccount", async () => {
					// Set the withdrawal limits for the contract, mainUserLimit, safekeeperUserLimit
					await instanceContractAsMainUser.setTokenLimits(tokenContractAddress, transferAmount, transferAmount);

					// Make the transfer
					await instanceContractAsMainUser.transferErcTokenMain(tokenContractAddress);

					await expect(instanceContractAsMainUser.transferErcTokenMain(tokenContractAddress)).to.be.revertedWith(
						"SavingsAccount__MainWithdrawalAlreadyMadeToday"
					);
				});

				it("ERC20 tokens can not be transferred more than once per day by safekeeperAccount", async () => {
					// Set the withdrawal limits for the contract, mainUserLimit, safekeeperUserLimit
					await instanceContractAsMainUser.setTokenLimits(tokenContractAddress, transferAmount, transferAmount);

					// Make the transfer
					await instanceContractAsSafekeeperUser.transferErcTokenSafekeeper(tokenContractAddress);

					await expect(instanceContractAsSafekeeperUser.transferErcTokenSafekeeper(tokenContractAddress)).to.be.revertedWith(
						"SavingsAccount__SafekeeperWithdrawalAlreadyMadeToday"
					);
				});

				it("ERC20 tokens can be transferred by mainUser after a day has passed", async () => {
					// Set the withdrawal limits for the contract, mainUserLimit, safekeeperUserLimit
					await instanceContractAsMainUser.setTokenLimits(tokenContractAddress, transferAmount, transferAmount);

					// Make the transfer
					await instanceContractAsMainUser.transferErcTokenMain(tokenContractAddress);

					// Simulate time moving forward on blockchain
					// At 15:35:00 in Patrick Collins' 32-hour FreeCodeCamp Solidity course on YouTube
					await network.provider.send("evm_increaseTime", [SECONDS_IN_DAY + 1]);
					await network.provider.request({ method: "evm_mine", params: [] });

					// Make the next-day transfer
					await instanceContractAsMainUser.transferErcTokenMain(tokenContractAddress);

					const mainAccountBalance = await myTokenContract.balanceOf(mainAccount.address);
					const savingsAccountBalance = await myTokenContract.balanceOf(savingsAccountContractAddress);

					assert.equal(mainAccountBalance, startingBalance + transferAmount + transferAmount);
					assert.equal(savingsAccountBalance, startingBalance - transferAmount - transferAmount);
				});

				it("ERC20 tokens can be transferred by safekeeperUser after a day has passed", async () => {
					// Set the withdrawal limits for the contract, mainUserLimit, safekeeperUserLimit
					await instanceContractAsMainUser.setTokenLimits(tokenContractAddress, transferAmount, transferAmount);

					// Make the transfer
					await instanceContractAsSafekeeperUser.transferErcTokenSafekeeper(tokenContractAddress);

					// Simulate time moving forward on blockchain
					// At 15:35:00 in Patrick Collins' 32-hour FreeCodeCamp Solidity course on YouTube
					await network.provider.send("evm_increaseTime", [SECONDS_IN_DAY + 1]);
					await network.provider.request({ method: "evm_mine", params: [] });

					// Make the next-day transfer
					await instanceContractAsSafekeeperUser.transferErcTokenSafekeeper(tokenContractAddress);

					const safekeeperAccountBalance = await myTokenContract.balanceOf(safekeeperAccount.address);
					const savingsAccountBalance = await myTokenContract.balanceOf(savingsAccountContractAddress);

					assert.equal(safekeeperAccountBalance, transferAmount + transferAmount);
					assert.equal(savingsAccountBalance, startingBalance - transferAmount - transferAmount);
				});

				it("Large ERC20 tokens can be transferred after enabled by safekeeperUser", async () => {
					// Enable big withdrawals
					await instanceContractAsSafekeeperUser.safekeeperAccountEnableBigWithdrawal();

					// Make the transfer
					await instanceContractAsMainUser.mainAccountMakeBigTokenWithdrawal(tokenContractAddress, transferAmount + 1, mainAccount.address);

					const mainAccountBalance = await myTokenContract.balanceOf(mainAccount.address);
					const savingsAccountBalance = await myTokenContract.balanceOf(savingsAccountContractAddress);

					assert.equal(mainAccountBalance, startingBalance + transferAmount + 1);
					assert.equal(savingsAccountBalance, startingBalance - transferAmount - 1);
				});

				it("Large ERC20 tokens can be transferred to another account", async () => {
					// Enable big withdrawals
					await instanceContractAsSafekeeperUser.safekeeperAccountEnableBigWithdrawal();

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