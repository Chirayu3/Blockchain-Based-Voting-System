import React from "react";
import Feature from "../Features/Feature";
import { MdGppGood, MdLibraryAddCheck, MdLock, MdShare } from "react-icons/md";

const Features = () => {
  return (
    <section className="features-wrapper" id="features">
      <div className="features-badge">
        <i className="bi bi-cpu"></i> Protocol Capabilities
      </div>
      <h2 className="title-large">Enterprise Blockchain Security</h2>
      <p className="features-subtitle">
        Cryptographic guarantees, distributed consensus, and biometric identity verification ensure absolute election integrity and trust.
      </p>

      <div className="mobile-wrapper">
        <div>
          <Feature title="Cryptographic Immutability" icon={<MdLock />} align="right">
            <p>
              Once a ballot is committed to an Ethereum smart contract block, it is mathematically permanent. No administrator, attacker, or authority can modify or delete recorded votes.
            </p>
          </Feature>
        </div>

        <div className="mobile-container">
          <img src="/mobile.png" alt="Mobile voting application interface" />
        </div>

        <div>
          <Feature title="Biometric Liveness & Anti-Spoofing" icon={<MdGppGood />} align="left">
            <p>
              Live facial verification with head pose challenge-response protects against presentation attacks. Biometric templates are encrypted with authenticated AES-256-GCM.
            </p>
          </Feature>
        </div>

        <div>
          <Feature title="Decentralized Consensus" icon={<MdShare />} align="right">
            <p>
              Eliminates single points of failure. The election status and results are independently validated across distributed nodes, ensuring continuous uptime and censorship resistance.
            </p>
          </Feature>
        </div>

        <div>
          <Feature
            title="Verifiable On-Chain Ledger"
            icon={<MdLibraryAddCheck />}
            align="left"
          >
            <p>
              Every voter receives a cryptographic transaction hash receipt. Anyone can independently inspect election returns without compromising voter secret ballot confidentiality.
            </p>
          </Feature>
        </div>
      </div>
    </section>
  );
};

export default Features;
