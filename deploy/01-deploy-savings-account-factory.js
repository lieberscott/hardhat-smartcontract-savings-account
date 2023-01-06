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
			const backupAccount = accounts[2];

      const factoryContract = await ethers.getContract("SavingsAccountFactory")

      const res = await factoryContract.createSavingsAccount(mainAccount.address, backupAccount.address, "1000000000000000000", "100000000000000000", "Scott's Account", { from: deployer, value: "3000000000000000000" })
      console.log(`Instance deployed at ${res.address}`)
      
      console.log("Deploying MyToken.sol...")
      const tokenContract = await deploy("MyToken", {
        from: deployer,
        log: true,
        args: [mainAccount.address, mainAccount.address, "100000000000000000000"],
        // we need to wait if on a live network so we can verify properly
        waitConfirmations: network.config.blockConfirmations || 1,
    })
    log(`tokenContract deployed at ${tokenContract.address}`);

    }
}

module.exports.tags = ["all", "savingsaccountfactory"];