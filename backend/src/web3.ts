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

// Auto-deploy helper when Ganache restarts or contract address has no code
async function getOrDeployInstance(c: any): Promise<any> {
  const artifactPath = path.resolve(__dirname, "../build/contracts/Election.json");
  let instance: any = null;
  let needsRedeploy = false;

  try {
    instance = await c.deployed();
    const code = await web3.eth.getCode(instance.address);
    if (!code || code === "0x" || code === "0x0") {
      needsRedeploy = true;
    }
  } catch (_e) {
    needsRedeploy = true;
  }

  if (needsRedeploy) {
    console.warn("[Web3] Contract bytecode missing at target address (Ganache reset). Auto-deploying Election contract...");
    const accounts = await web3.eth.getAccounts();
    const netId = await web3.eth.net.getId();
    
    // Deploy fresh instance to active Ganache instance
    const newInstance = await c.new({ from: accounts[0], gas: 6721975 });
    
    // Update artifact on disk so subsequent Truffle lookups find it
    try {
      const rawData = fs.readFileSync(artifactPath, "utf-8");
      const data = JSON.parse(rawData);
      if (!data.networks) data.networks = {};
      data.networks[netId] = {
        events: {},
        links: {},
        address: newInstance.address,
        transactionHash: newInstance.transactionHash || ""
      };
      fs.writeFileSync(artifactPath, JSON.stringify(data, null, 2), "utf-8");
      cachedMtime = fs.statSync(artifactPath).mtimeMs;
    } catch (err: any) {
      console.error("[Web3] Failed to update Election.json with auto-deployed address:", err.message);
    }

    c.setNetwork(netId);
    if (!c.networks) c.networks = {};
    c.networks[netId] = { address: newInstance.address };
    console.log(`[Web3] Auto-deployed Election contract successfully to: ${newInstance.address}`);
    return newInstance;
  }

  return instance;
}

// Proxy allows existing `ElectionContract.deployed()`, `ElectionContract.setProvider()`, etc. to work seamlessly
const ElectionContract: any = new Proxy({}, {
  get(_target, prop) {
    const c = getElectionContract();
    if (!c) {
      throw new Error("ElectionContract artifact not available. Please ensure truffle migrate has been run.");
    }
    if (prop === "deployed") {
      return () => getOrDeployInstance(c);
    }
    const val = (c as any)[prop];
    if (typeof val === "function") {
      return val.bind(c);
    }
    return val;
  },
});

export default ElectionContract;
