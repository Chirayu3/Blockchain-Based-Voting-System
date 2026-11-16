import Web3 from "web3";
import data from "../build/contracts/Election.json";

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:7545";

export const web3 = new Web3(RPC_URL);

const provider = new Web3.providers.HttpProvider(RPC_URL);
const contract = require("@truffle/contract");

const ElectionContract = contract(data);

ElectionContract.setProvider(provider);

export default ElectionContract;
