import { Response } from "express";
import { AuthenticatedRequest } from "../../middlewares/auth";
import { Poll } from "../../entity/Poll";
import { User } from "../../entity/User";
import { Transaction } from "../../entity/Transaction";
import ElectionContract from "../../web3";

// Helper to escape CSV cell according to RFC 4180
const escapeCsv = (str: any): string => {
  if (str === null || str === undefined) return '""';
  const val = String(str).replace(/"/g, '""');
  return `"${val}"`;
};

export default async (req: AuthenticatedRequest, res: Response) => {
  try {
    const electionIdParam = req.params.id || req.query.id;
    let poll: Poll | undefined;

    if (electionIdParam) {
      poll = await Poll.findOne({
        where: { id: Number(electionIdParam) },
        relations: ["candidates"],
      });
    }

    // If no specific poll ID, check active or latest poll
    if (!poll) {
      poll =
        (await Poll.findOne({
          where: { status: "running" },
          relations: ["candidates"],
          order: { id: "DESC" },
        })) ||
        (await Poll.findOne({
          relations: ["candidates"],
          order: { id: "DESC" },
        }));
    }

    const eligibleVoters = await User.count({
      where: { admin: false, verified: true },
    });

    let electionTitle = poll?.name || "Election";
    let electionDescription = poll?.description || "";
    let electionStatus = poll?.status || "unknown";
    const electionId = poll?.id || 1;

    let candidateCounts: Record<string, number> = {};
    let totalVotes = 0;

    // Check if smart contract is currently running this election
    let isLiveOnContract = false;
    try {
      const instance = await ElectionContract.deployed();
      const liveStatus = await instance.getStatus();
      const liveName = await instance.getElectionName();

      if (
        liveStatus !== "not-started" &&
        (!poll || poll.status === "running" || liveName === poll.name)
      ) {
        isLiveOnContract = true;
        electionTitle = liveName || electionTitle;
        electionDescription =
          (await instance.getElectionDescription()) || electionDescription;
        electionStatus = liveStatus;

        const contractCandidates: string[] = await instance.getCandidates();
        const rawVotes = await instance.getVotes();
        totalVotes = rawVotes.length;

        for (const c of contractCandidates) {
          candidateCounts[c] = 0;
        }
        for (const v of rawVotes) {
          const cand = v[3];
          if (candidateCounts[cand] !== undefined) {
            candidateCounts[cand]++;
          }
        }
      }
    } catch (e) {
      console.warn("Could not query smart contract for CSV export:", e);
    }

    // If not live on contract or if poll was finished, calculate from transactions
    if (!isLiveOnContract && poll) {
      const txs = await Transaction.find({
        where: { electionId: poll.id, status: "success" },
      });
      totalVotes = txs.length;

      if (poll.candidates && poll.candidates.length > 0) {
        for (const c of poll.candidates) {
          candidateCounts[c.name] = 0;
        }
      }

      for (const t of txs) {
        candidateCounts[t.candidateName] =
          (candidateCounts[t.candidateName] || 0) + 1;
      }
    }

    const turnout =
      eligibleVoters > 0
        ? ((totalVotes / eligibleVoters) * 100).toFixed(2) + "%"
        : "0.00%";

    // Build RFC 4180 compliant CSV
    const rows: string[] = [];

    // Header block
    rows.push(`${escapeCsv("Election ID")},${escapeCsv(electionId)}`);
    rows.push(`${escapeCsv("Election Title")},${escapeCsv(electionTitle)}`);
    rows.push(
      `${escapeCsv("Election Description")},${escapeCsv(electionDescription)}`
    );
    rows.push(`${escapeCsv("Election Status")},${escapeCsv(electionStatus)}`);
    rows.push(`${escapeCsv("Total Votes Cast")},${escapeCsv(totalVotes)}`);
    rows.push(
      `${escapeCsv("Eligible Verified Voters")},${escapeCsv(eligibleVoters)}`
    );
    rows.push(`${escapeCsv("Voter Turnout")},${escapeCsv(turnout)}`);
    rows.push(
      `${escapeCsv("Report Generated At")},${escapeCsv(
        new Date().toISOString()
      )}`
    );
    rows.push(""); // blank line separator

    // Candidates table
    rows.push(
      `${escapeCsv("Candidate Name")},${escapeCsv(
        "Vote Count"
      )},${escapeCsv("Vote Percentage")}`
    );

    const candidateNames = Object.keys(candidateCounts);
    if (candidateNames.length === 0) {
      rows.push(`${escapeCsv("No candidates found")},${escapeCsv(0)},${escapeCsv("0.00%")}`);
    } else {
      for (const cand of candidateNames) {
        const count = candidateCounts[cand] || 0;
        const percentage =
          totalVotes > 0
            ? ((count / totalVotes) * 100).toFixed(2) + "%"
            : "0.00%";
        rows.push(
          `${escapeCsv(cand)},${escapeCsv(count)},${escapeCsv(percentage)}`
        );
      }
    }

    const csvContent = rows.join("\r\n");
    const filename = `election_report_${electionId}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    return res.status(200).send(csvContent);
  } catch (error) {
    console.error("Error generating election CSV report:", error);
    return res.status(500).send("Failed to export election report");
  }
};
