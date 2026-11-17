import { Request, Response } from "express";
import ElectionContract from "../../web3";
import { Poll } from "../../entity/Poll";

export default async (_: Request, res: Response) => {
  try {
    const instance = await ElectionContract.deployed();
    const status = await instance.getStatus();
    return res.send({ status });
  } catch (err: any) {
    console.warn("[Poll Status] Smart contract status query error, querying database:", err.message);
    try {
      const activePoll = await Poll.findOne({ where: { status: "running" } });
      if (activePoll) {
        return res.send({ status: "running" });
      }
    } catch {
      // Ignore DB read errors
    }
    return res.send({ status: "not-started" });
  }
};
