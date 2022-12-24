const { ethers, network } = require("hardhat");
const fs = require("fs");
require("dotenv").config();

const FRONT_END_ADDRESSES_FILE  = "../nextjs-smartcontract-savings-account/constants/contractAddresses.json";
const FRONT_END_ABI_FILE  = "../nextjs-smartcontract-savings-account/constants/abi.json";

module.exports = async () => {

    if (process.env.UPDATE_FRONT_END) {
        console.log("Updating Front end");
        updateContractAddresses();
        updateAbi();
    }
}

const updateAbi = async () => {
    const savingsAccountFactory = ethers.getContractFactory("SavingsAccountFactory");

    fs.writeFileSync(FRONT_END_ADDRESSES_FILE, savingsAccountFactory.interface.format(ethers.utils.FormatTypes.json));
}

const updateContractAddresses = async () => {
    const savingsAccountFactory = ethers.getContractFactory("SavingsAccountFactory");

    const chainId = network.config.chainId.toString();

    const currentAddresses = JSON.parse(fs.readFileSync(FRONT_END_ADDRESSES_FILE, utf8));
    if (chainId in contractAddresses) {
        if (!contractAddresses[chainId].includes(savingsAccountFactory.address)) {
            contractAddress[chainId].push(savingsAccountFactory.address);
        }
    }
    else {
        contractAddresses[chainId] = [savingsAccountFactory.address];
    }
    fs.writeFileSync(FRONT_END_ADDRESSES_FILE, JSON.stringify(currentAddresses));
}

module.exports.tags = ["all", "frontend"];