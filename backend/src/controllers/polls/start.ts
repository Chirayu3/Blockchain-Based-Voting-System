import { Request, Response } from "express";
import * as yup from "yup";
import ElectionContract, { web3 } from "../../web3";
import { Poll } from "../../entity/Poll";
import { Candidate } from "../../entity/Candidate";

const schema = yup.object({
  body: yup.object({
    name: yup.string().min(3).required(),
    description: yup.string().min(10).required(),
    candidates: yup.array(
      yup.object({
        name: yup.string().min(3).required(),
        info: yup.string().min(10).required(),
      })
    ).min(2),
  }),
});

export default async (req: Request, res: Response) => {
  try {
    await schema.validate(req);
  } catch (error: any) {
    return res.status(400).send(error.errors);
  }

  const instance = await ElectionContract.deployed();

  const status = await instance.getStatus();
  if (status !== "not-started")
    return res.status(400).send("Election already started or not reset");

  const accounts = await web3.eth.getAccounts();

  // Save to Ethereum Smart Contract
  await instance.setElectionDetails(req.body.name, req.body.description, {
    from: accounts[0],
  });

  for (let i = 0; i < req.body.candidates.length; i++) {
    const candidate = req.body.candidates[i];
    await instance.addCandidate(candidate.name, candidate.info, {
      from: accounts[0],
    });
  }

  // Sync to MySQL
  // Close any previously hanging running polls first
  await Poll.update({ status: "running" }, { status: "finished" });

  const poll = new Poll();
  poll.name = req.body.name;
  poll.description = req.body.description;
  poll.status = "running";
  await poll.save();

  for (let i = 0; i < req.body.candidates.length; i++) {
    const c = req.body.candidates[i];
    const candidateEntity = new Candidate();
    candidateEntity.name = c.name;
    candidateEntity.info = c.info;
    candidateEntity.poll = poll;
    await candidateEntity.save();
  }

  return res.send({
    id: poll.id,
    name: poll.name,
    description: poll.description,
    candidates: req.body.candidates,
  });
};
