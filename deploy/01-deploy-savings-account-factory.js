const { network, ethers } = require("hardhat")
const { networkConfig, developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")
require("dotenv").config()

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = network.config.chainId;
    let savingsAccountFactory;


    log("----------------------------------------------------");
    log("Deploying SavingsAccountFactory and waiting for confirmations...");
    savingsAccountFactory = await deploy("SavingsAccountFactory", {
        from: deployer,
        log: true,
        // we need to wait if on a live network so we can verify properly
        waitConfirmations: network.config.blockConfirmations || 1,
    })
    log(`SavingsAccountFactory deployed at ${savingsAccountFactory.address}`);

    // if not a dev chain, then verify contract
    if (
        !developmentChains.includes(network.name) &&
        process.env.ETHERSCAN_API_KEY
    ) {
        await verify(savingsAccountFactory.address);
    }
    else {
      // if it's a dev chain, deploy a savings account contract and get the abi
      // const factoryContract = ethers.getContractFactory("SavingsAccountFactory");
      console.log('deploying instance ...');
      const accounts = await ethers.getSigners(); // could also do with getNamedAccounts
      const mainAccount = accounts[1];
      const safekeeperAccount = accounts[2];

      const factoryContract = await ethers.getContract("SavingsAccountFactory")

      const res = await factoryContract.createSavingsAccount(mainAccount.address, safekeeperAccount.address, "1000000000000000000", "100000000000000000", "Scott's Account", { from: deployer, value: "3000000000000000000" })
      const res2 = await factoryContract.createSavingsAccount(safekeeperAccount.address, mainAccount.address, "1000000000000000000", "100000000000000000", "Ryan's Account", { from: deployer, value: "3000000000000000000" })

      console.log(`Instances deployed`)

      // get contract instances so you can send the MyTokens to them

      const mainUserInstanceAddress = (await factoryContract.getContractFromMainAddress(mainAccount.address)).toString()
      const safekeeperUserInstanceAddress = (await factoryContract.getContractFromMainAddress(safekeeperAccount.address)).toString()

      console.log("mainUserInstanceAddress : ", mainUserInstanceAddress);
      console.log("safekeeperUserInstanceAddress", safekeeperUserInstanceAddress)

      const initialTokenAmount = "100000000000000000000"

      const initialTransferAmount = (parseInt(initialTokenAmount) / 2).toString()
      
      console.log("Deploying MyToken.sol...")
      const tokenDeploy = await deploy("MyToken", {
        from: deployer,
        log: true,
        args: [mainAccount.address, safekeeperAccount.address, initialTokenAmount],
        // we need to wait if on a live network so we can verify properly
        waitConfirmations: network.config.blockConfirmations || 1,
    })
    log(`tokenContract deployed at ${tokenDeploy.address}`);

    const tokenContract = await ethers.getContract("MyToken")

    const transaction1 = await tokenContract.connect(mainAccount).transfer(mainUserInstanceAddress, initialTransferAmount)
    const transaction2 = await tokenContract.connect(safekeeperAccount).transfer(safekeeperUserInstanceAddress, initialTransferAmount)

    log("Transfered tokens to savings account addresses complete")


    }
}

module.exports.tags = ["all", "savingsaccountfactory"];