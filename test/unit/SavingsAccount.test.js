const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
	? describe.skip
	: describe("Unit Tests", function () {
		let savingsAccountContract, vrfCoordinatorV2Mock, savingsAccountEntranceFee, interval, deployer, mainAccount, backupAccount;

		let savingsAccountFactory, factoryContract;

		let savingsAccountInstance, instanceContract;

		const mainUserWithdrawalLimit = ethers.utils.parseEther("1");
		const backupUserWithdrawalLimit = ethers.utils.parseEther("0.05");

		beforeEach(async () => {
			accounts = await ethers.getSigners(); // could also do with getNamedAccounts
			deployer = accounts[0];
			mainAccount = accounts[1];
			backupAccount = accounts[2];

			savingsAccountFactory = await ethers.getContractFactory("SavingsAccountFactory");
			factoryContract = await savingsAccountFactory.deploy();


			// savingsAccountInstance = await savingsAccountFactory.deploy();
		});

		it("Factory should start with an empty mainAccountToContractAddress mapping", async function () {
			const userData = await factoryContract.getContractFromMainAddress(mainAccount.address);
			assert.equal(userData.exists, false);
		});

		it("Factory adds mainAccount to mapping upon savingsAccount deploy", async function() {
			await factoryContract.createSavingsAccount(mainAccount.address, backupAccount.address, ethers.utils.parseEther("1"), ethers.utils.parseEther("0.05"));
			const userData = await factoryContract.getContractFromMainAddress(mainAccount.address);
			assert.equal(userData.exists, true);
		});

		it("Factory emits event upon savingsAccount deploy", async () => {
			await expect(factoryContract.createSavingsAccount(mainAccount.address, backupAccount.address, mainUserWithdrawalLimit, backupUserWithdrawalLimit)).to.emit(
				factoryContract,
				"SavingsAccountCreated"
			)
			.withArgs(
				mainAccount.address,
				backupAccount.address,
				mainUserWithdrawalLimit,
				backupUserWithdrawalLimit
			)
		})

		it("Child adds constructor data to contract", async function() {

			// deploy a child savingsAccount contract
			await factoryContract.createSavingsAccount(mainAccount.address, backupAccount.address, mainUserWithdrawalLimit, backupUserWithdrawalLimit);
			// get the newly deployed child contract's address
			const savingsAccountContractAddress = await factoryContract.getContractFromMainAddress(mainAccount.address);
			// create a connection to the generic SavingsAccount.sol contract
			const savingsAccount = await ethers.getContractFactory("SavingsAccount");
			// get the specific instance of the recently deployed child contract
			instanceContract = savingsAccount.attach(savingsAccountContractAddress);
			
			// you can now interact with the child contract
			const returnedMainAccount = await instanceContract.getMainAccount();
			const returnedBackupAccount = await instanceContract.getBackupAccount();
			const returnedMainWithdrawalLimit = await instanceContract.getMainAccountWithdrawalLimit();
			const returnedBackupWithdrawalLimit = await instanceContract.getBackupAccountWithdrawalLimit();
			
			assert.equal(returnedMainAccount, mainAccount.address);
			assert.equal(returnedBackupAccount, backupAccount.address);
			assert.equal(returnedMainWithdrawalLimit, mainUserWithdrwalLimit);
			assert.equal(returnedBackupWithdrawalLimit, backupUserWithdrawalLimit);
		});


		// 	await deployments.fixture(["mocks", "savingsAccount"]) // Deploys modules with the tags "mocks" and "savingsAccount"
		// 	vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock") // Returns a new connection to the VRFCoordinatorV2Mock contract
		// 	savingsAccountContract = await ethers.getContract("SavingsAccount") // Returns a new connection to the Raffle contract
		// 	savingsAccountInstance = savingsAccountContract.connect(mainAccount) // Returns a new instance of the Raffle contract connected to mainAccount
		// 	savingsAccountEntranceFee = await savingsAccountInstance.getEntranceFee()
		// 	interval = await savingsAccountInstance.getInterval()
		// });

		// describe("constructor", function () {
		// 	it("initializes the savingsAccountInstance correctly", async () => {
		// 		// Ideally, we'd separate these out so that only 1 assert per "it" block
		// 		// And ideally, we'd make this check everything
		// 		const savingsAccountState = (await savingsAccountInstance.getRaffleState()).toString()
		// 		// Comparisons for Raffle initialization:
		// 		assert.equal(savingsAccountState, "0")
		// 		assert.equal(
		// 			interval.toString(),
		// 			networkConfig[network.config.chainId]["keepersUpdateInterval"]
		// 		)
		// 	});
		// })

		// 			describe("enterRaffle", function () {
		// 					it("reverts when you don't pay enough", async () => {
		// 							await expect(savingsAccountInstance.enterRaffle()).to.be.revertedWith( // is reverted when not paid enough or savingsAccountInstance is not open
		// 									"Raffle__SendMoreToEnterRaffle"
		// 							)
		// 					})
		// 					it("records mainAccount when they enter", async () => {
		// 							await savingsAccountInstance.enterRaffle({ value: savingsAccountEntranceFee })
		// 							const contractMainAccount = await savingsAccountInstance.getMainAccount(0)
		// 							assert.equal(mainAccount.address, contractMainAccount)
		// 					})
		// 					it("emits event on enter", async () => {
		// 							await expect(savingsAccountInstance.enterRaffle({ value: savingsAccountEntranceFee })).to.emit( // emits RaffleEnter event if entered to index mainAccount(s) address
		// 									savingsAccountInstance,
		// 									"RaffleEnter"
		// 							)
		// 					})
		// 					it("doesn't allow entrance when savingsAccountInstance is calculating", async () => {
		// 							await savingsAccountInstance.enterRaffle({ value: savingsAccountEntranceFee })
		// 							// for a documentation of the methods below, go here: https://hardhat.org/hardhat-network/reference
		// 							await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
		// 							await network.provider.request({ method: "evm_mine", params: [] })
		// 							// we pretend to be a keeper for a second
		// 							await savingsAccountInstance.performUpkeep([]) // changes the state to calculating for our comparison below
		// 							await expect(savingsAccountInstance.enterRaffle({ value: savingsAccountEntranceFee })).to.be.revertedWith( // is reverted as savingsAccountInstance is calculating
		// 									"Raffle__RaffleNotOpen"
		// 							)
		// 					})
		// 			})
		// 			describe("checkUpkeep", function () {
		// 					it("returns false if people haven't sent any ETH", async () => {
		// 							await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
		// 							await network.provider.request({ method: "evm_mine", params: [] })
		// 							const { upkeepNeeded } = await savingsAccountInstance.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasMainAccounts)
		// 							assert(!upkeepNeeded)
		// 					})
		// 					it("returns false if savingsAccountInstance isn't open", async () => {
		// 							await savingsAccountInstance.enterRaffle({ value: savingsAccountEntranceFee })
		// 							await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
		// 							await network.provider.request({ method: "evm_mine", params: [] })
		// 							await savingsAccountInstance.performUpkeep([]) // changes the state to calculating
		// 							const savingsAccountState = await savingsAccountInstance.getRaffleState() // stores the new state
		// 							const { upkeepNeeded } = await savingsAccountInstance.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasMainAccounts)
		// 							assert.equal(savingsAccountState.toString() == "1", upkeepNeeded == false)
		// 					})
		// 					it("returns false if enough time hasn't passed", async () => {
		// 							await savingsAccountInstance.enterRaffle({ value: savingsAccountEntranceFee })
		// 							await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]) // use a higher number here if this test fails
		// 							await network.provider.request({ method: "evm_mine", params: [] })
		// 							const { upkeepNeeded } = await savingsAccountInstance.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasMainAccounts)
		// 							assert(!upkeepNeeded)
		// 					})
		// 					it("returns true if enough time has passed, has mainAccounts, eth, and is open", async () => {
		// 							await savingsAccountInstance.enterRaffle({ value: savingsAccountEntranceFee })
		// 							await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
		// 							await network.provider.request({ method: "evm_mine", params: [] })
		// 							const { upkeepNeeded } = await savingsAccountInstance.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasMainAccount)
		// 							assert(upkeepNeeded)
		// 					})
		// 			})

		// 			describe("performUpkeep", function () {
		// 					it("can only run if checkupkeep is true", async () => {
		// 							await savingsAccountInstance.enterRaffle({ value: savingsAccountEntranceFee })
		// 							await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
		// 							await network.provider.request({ method: "evm_mine", params: [] })
		// 							const tx = await savingsAccountInstance.performUpkeep("0x") 
		// 							assert(tx)
		// 					})
		// 					it("reverts if checkup is false", async () => {
		// 							await expect(savingsAccountInstance.performUpkeep("0x")).to.be.revertedWith( 
		// 									"Raffle__UpkeepNotNeeded"
		// 							)
		// 					})
		// 					it("updates the savingsAccountInstance state and emits a requestId", async () => {
		// 							// Too many asserts in this test!
		// 							await savingsAccountInstance.enterRaffle({ value: savingsAccountEntranceFee })
		// 							await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
		// 							await network.provider.request({ method: "evm_mine", params: [] })
		// 							const txResponse = await savingsAccountInstance.performUpkeep("0x") // emits requestId
		// 							const txReceipt = await txResponse.wait(1) // waits 1 block
		// 							const savingsAccountState = await savingsAccountInstance.getRaffleState() // updates state
		// 							const requestId = txReceipt.events[1].args.requestId
		// 							assert(requestId.toNumber() > 0)
		// 							assert(savingsAccountState == 1) // 0 = open, 1 = calculating
		// 					})
		// 			})
		// 			describe("fulfillRandomWords", function () {
		// 					beforeEach(async () => {
		// 							await savingsAccountInstance.enterRaffle({ value: savingsAccountEntranceFee })
		// 							await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
		// 							await network.provider.request({ method: "evm_mine", params: [] })
		// 					})
		// 					it("can only be called after performupkeep", async () => {
		// 							await expect(
		// 									vrfCoordinatorV2Mock.fulfillRandomWords(0, savingsAccountInstance.address) // reverts if not fulfilled
		// 							).to.be.revertedWith("nonexistent request")
		// 							await expect(
		// 									vrfCoordinatorV2Mock.fulfillRandomWords(1, savingsAccountInstance.address) // reverts if not fulfilled
		// 							).to.be.revertedWith("nonexistent request")
		// 					})

		// 			// This test is too big...
		// 			// This test simulates users entering the savingsAccountInstance and wraps the entire functionality of the savingsAccountInstance
		// 			// inside a promise that will resolve if everything is successful.
		// 			// An event listener for the WinnerPicked is set up
		// 			// Mocks of chainlink keepers and vrf coordinator are used to kickoff this winnerPicked event
		// 			// All the assertions are done once the WinnerPicked event is fired
		// 					it("picks a winner, resets, and sends money", async () => {
		// 							const additionalEntrances = 3 // to test
		// 							const startingIndex = 2
		// 							for (let i = startingIndex; i < startingIndex + additionalEntrances; i++) { // i = 2; i < 5; i=i+1
		// 									savingsAccountInstance = savingsAccountContract.connect(accounts[i]) // Returns a new instance of the Raffle contract connected to mainAccount
		// 									await savingsAccountInstance.enterRaffle({ value: savingsAccountEntranceFee })
		// 							}
		// 							const startingTimeStamp = await savingsAccountInstance.getLastTimeStamp() // stores starting timestamp (before we fire our event)

		// 							// This will be more important for our staging tests...
		// 							await new Promise(async (resolve, reject) => {
		// 									savingsAccountInstance.once("WinnerPicked", async () => { // event listener for WinnerPicked
		// 											console.log("WinnerPicked event fired!")
		// 											// assert throws an error if it fails, so we need to wrap
		// 											// it in a try/catch so that the promise returns event
		// 											// if it fails.
		// 											try {
		// 													// Now lets get the ending values...
		// 													const recentWinner = await savingsAccountInstance.getRecentWinner()
		// 													const savingsAccountState = await savingsAccountInstance.getRaffleState()
		// 													const winnerBalance = await accounts[2].getBalance()
		// 													const endingTimeStamp = await savingsAccountInstance.getLastTimeStamp()
		// 													await expect(savingsAccountInstance.getMainAccount(0)).to.be.reverted
		// 													// Comparisons to check if our ending values are correct:
		// 													assert.equal(recentWinner.toString(), accounts[2].address)
		// 													assert.equal(savingsAccountState, 0)
		// 													assert.equal(
		// 															winnerBalance.toString(), 
		// 															startingBalance // startingBalance + ( (savingsAccountEntranceFee * additionalEntrances) + savingsAccountEntranceFee )
		// 																	.add(
		// 																			savingsAccountEntranceFee
		// 																					.mul(additionalEntrances)
		// 																					.add(savingsAccountEntranceFee)
		// 																	)
		// 																	.toString()
		// 													)
		// 													assert(endingTimeStamp > startingTimeStamp)
		// 													resolve() // if try passes, resolves the promise 
		// 											} catch (e) { 
		// 													reject(e) // if try fails, rejects the promise
		// 											}
		// 									})

		// 									// kicking off the event by mocking the chainlink keepers and vrf coordinator
		// 									const tx = await savingsAccountInstance.performUpkeep("0x")
		// 									const txReceipt = await tx.wait(1)
		// 									const startingBalance = await accounts[2].getBalance()
		// 									await vrfCoordinatorV2Mock.fulfillRandomWords(
		// 											txReceipt.events[1].args.requestId,
		// 											savingsAccountInstance.address
		// 									)
		// 							})
		// 					})
		// 			})
			})