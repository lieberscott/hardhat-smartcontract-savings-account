const { ethers, network } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config")
const fs = require("fs");
require("dotenv").config();

// import { contractAddresses } from "../../nextjs-smartcontract-savings-account/constants"

const FRONT_END_ADDRESSES_FILE  = "../nextjs-smartcontract-savings-account/constants/contractAddresses.json";
const FRONT_END_MY_TOKEN_ADDRESS_FILE  = "../nextjs-smartcontract-savings-account/constants/myTokenAddress.json";
const FRONT_END_FACTORY_ABI_FILE  = "../nextjs-smartcontract-savings-account/constants/factoryAbi.json";
const FRONT_END_INSTANCE_ABI_FILE  = "../nextjs-smartcontract-savings-account/constants/instanceAbi.json";

module.exports = async () => {

    if (process.env.UPDATE_FRONT_END) {
        console.log("Updating Front end");
        updateContractAddresses();
        // updateAbi();
    }
}

const updateAbi = async () => {
    const savingsAccountFactory = ethers.getContract("SavingsAccountFactory");
    const savingsAccount = ethers.getContract("SavingsAccount");

    fs.writeFileSync(FRONT_END_FACTORY_ABI_FILE, savingsAccountFactory.interface.format(ethers.utils.FormatTypes.json));
    fs.writeFileSync(FRONT_END_INSTANCE_ABI_FILE, savingsAccount.interface.format(ethers.utils.FormatTypes.json));
}

const updateContractAddresses = async () => {
    const savingsAccountFactory = ethers.getContractFactory("SavingsAccountFactory");
    const myToken = ethers.getContractFactory("MyToken")

    const chainId = network.config.chainId.toString();

    const currentAddresses = JSON.parse(fs.readFileSync(FRONT_END_ADDRESSES_FILE, "utf8"));
    if (chainId in currentAddresses) {
        if (!currentAddresses[chainId].includes(savingsAccountFactory.address)) {
            currentAddresses[chainId].push(savingsAccountFactory.address);
        }
    }
    else {
        currentAddresses[chainId] = [savingsAccountFactory.address];
    }
    fs.writeFileSync(FRONT_END_ADDRESSES_FILE, JSON.stringify(currentAddresses));


    const myTokenAddresses = JSON.parse(fs.readFileSync(FRONT_END_MY_TOKEN_ADDRESS_FILE, "utf8"));
    if (chainId in currentAddresses && developmentChains.includes(network.name)) {
        if (!myTokenAddresses[chainId].includes(myToken.address)) {
            myTokenAddresses[chainId].push(myToken.address);
        }
    }
    else {
        myTokenAddresses[chainId] = [myToken.address];
    }
    fs.writeFileSync(FRONT_END_MY_TOKEN_ADDRESS_FILE, JSON.stringify(myTokenAddresses));
}

module.exports.tags = ["all", "frontend"];