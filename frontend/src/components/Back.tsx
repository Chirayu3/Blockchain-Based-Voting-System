import React from "react";
import { IoIosArrowBack } from "react-icons/io";

interface BackProps {
  call: (any: any) => any;
  label?: string;
}

const Back = ({ call, label = "Back" }: BackProps) => {
  return (
    <button
      type="button"
      onClick={call}
      className="back"
      aria-label="Navigate back"
    >
      <span className="icon">
        <IoIosArrowBack />
      </span>
      <span>{label}</span>
    </button>
  );
};

export default Back;
