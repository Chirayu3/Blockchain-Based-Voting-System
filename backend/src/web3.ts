import Web3 from "web3";
import fs from "fs";
import path from "path";

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:7545";

export const web3 = new Web3(RPC_URL);

const provider = new Web3.providers.HttpProvider(RPC_URL);
const contract = require("@truffle/contract");

let cachedMtime: number = 0;
let cachedContract: any = null;

export const getElectionContract = () => {
  const artifactPath = path.resolve(__dirname, "../build/contracts/Election.json");

  try {
    const stats = fs.statSync(artifactPath);
    if (!cachedContract || stats.mtimeMs !== cachedMtime) {
      const rawData = fs.readFileSync(artifactPath, "utf-8");
      const data = JSON.parse(rawData);
      const newContract = contract(data);
      newContract.setProvider(provider);
      cachedContract = newContract;
      cachedMtime = stats.mtimeMs;
    }
  } catch (err: any) {
    if (!cachedContract) {
      console.error("[Web3] Failed to load Election.json contract artifact:", err.message);
    }
  }

  return cachedContract;
};

// Proxy allows existing `ElectionContract.deployed()`, `ElectionContract.setProvider()`, etc. to work seamlessly
const ElectionContract: any = new Proxy({}, {
  get(_target, prop) {
    const c = getElectionContract();
    if (!c) {
      throw new Error("ElectionContract artifact not available. Please ensure truffle migrate has been run.");
    }
    const val = (c as any)[prop];
    if (typeof val === "function") {
      return val.bind(c);
    }
    return val;
  },
});

export default ElectionContract;
