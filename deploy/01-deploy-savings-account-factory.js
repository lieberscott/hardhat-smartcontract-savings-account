const { network } = require("hardhat")
const { networkConfig, developmentChains } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")
require("dotenv").config()

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = network.config.chainId;


    log("----------------------------------------------------");
    log("Deploying SavingsAccountFactory and waiting for confirmations...");
    const savingsAccountFactory = await deploy("SavingsAccountFactory", {
        from: deployer,
        log: true,
        // we need to wait if on a live network so we can verify properly
        waitConfirmations: network.config.blockConfirmations || 1,
    })
    log(`SavingsAccountFactory deployed at ${savingsAccountFactory.address}`);

    if (
        !developmentChains.includes(network.name) &&
        process.env.ETHERSCAN_API_KEY
    ) {
        await verify(savingsAccountFactory.address);
    }
}

module.exports.tags = ["all", "savingsaccountfactory"];