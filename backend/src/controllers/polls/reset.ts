import { Request, Response } from "express";
import ElectionContract, { web3 } from "../../web3";
import { Poll } from "../../entity/Poll";
import memoryCache from "memory-cache";

export default async (_: Request, res: Response) => {
  const accounts = await web3.eth.getAccounts();
  const instance = await ElectionContract.deployed();

  const status = await instance.getStatus();

  if (status !== "finished")
    return res.status(400).send("Election not finished or already reset");

  await instance.resetElection({ from: accounts[0] });

  // Ensure any running or pending status in MySQL is marked finished
  await Poll.update({ status: "running" }, { status: "finished" });

  memoryCache.clear();

  return res.send("successful");
};
